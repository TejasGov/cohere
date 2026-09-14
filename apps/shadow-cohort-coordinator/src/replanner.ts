import {
  identifyAffectedTasks,
  calculateReassignmentPenalty,
  shouldReplan,
  validateCapacityChangeNotice,
  type GroupProject,
  type PeerBidRecord,
  type PeerDescriptor,
  type PlanChange,
  type ProjectEvent,
  type ProjectPlan,
  type ProjectRuntimeState,
  type ReplanResult,
  type TaskAllocation
} from '@shadow-cohort/core';
import { A2APeerClient } from './a2a-client';
import type { NegotiationEvent } from './coordinator';

const round = (value: number): number => Math.round(value * 100) / 100;

function subsets<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let mask = 1; mask < 2 ** items.length; mask += 1) result.push(items.filter((_, index) => (mask & (1 << index)) !== 0));
  return result;
}

function assignedHours(state: ProjectRuntimeState): Record<string, number> {
  const hours: Record<string, number> = {};
  for (const allocation of state.plan.allocations) {
    if (state.taskStatuses[allocation.taskId] === 'done') continue;
    hours[allocation.studentId] = (hours[allocation.studentId] ?? 0) + allocation.estimatedHours;
  }
  return hours;
}

function fairness(plan: TaskAllocation[], state: ProjectRuntimeState) {
  return Object.fromEntries(Object.entries(state.capacitySnapshot).map(([studentId, capacity]) => {
    const allocatedHours = plan.filter((allocation) => allocation.studentId === studentId && state.taskStatuses[allocation.taskId] !== 'done').reduce((sum, allocation) => sum + allocation.estimatedHours, 0);
    return [studentId, { allocatedHours, availableHours: capacity.availableProjectHours, utilization: capacity.availableProjectHours === 0 ? 0 : round(allocatedHours / capacity.availableProjectHours) }];
  }));
}

export interface ReplanExecution { result: ReplanResult; events: NegotiationEvent[]; bidsByTask: Record<string, PeerBidRecord[]>; }

export async function replanWithA2A(project: GroupProject, state: ProjectRuntimeState, event: ProjectEvent, peers: PeerDescriptor[], timeoutMs = 4_000): Promise<ReplanExecution> {
  const events: NegotiationEvent[] = [];
  const log = (message: string): void => { events.push({ at: new Date().toISOString(), message }); };
  const empty = (status: ReplanResult['status'], warnings: string[]): ReplanExecution => ({
    result: { previousPlanVersion: state.planVersion, proposedPlanVersion: state.planVersion, triggeringEvent: event, changedAllocations: [], unchangedAllocations: state.plan.allocations, warnings, status },
    events,
    bidsByTask: {}
  });
  if (!shouldReplan(event, state)) return empty('no_change_needed', []);
  const affectedIds = identifyAffectedTasks(event, state);
  const affected = state.plan.allocations.filter((allocation) => affectedIds.includes(allocation.taskId) && state.taskStatuses[allocation.taskId] !== 'done');
  if (!event.studentId || !validateCapacityChangeNotice(event.newValue)) return empty('needs_team_decision', ['This event requires a broader feasibility review.']);
  const clients = peers.map((peer) => new A2APeerClient(peer, timeoutMs));
  const bidsByTask: Record<string, PeerBidRecord[]> = {};
  const warnings: string[] = [];
  for (const allocation of affected) {
    const task = project.tasks.find((candidate) => candidate.id === allocation.taskId);
    if (!task) continue;
    log(`A2A rebid requested for ${task.title}.`);
    const settled = await Promise.allSettled(clients.map(async (client) => ({ client, bid: await client.evaluateTask(task) })));
    bidsByTask[task.id] = settled.flatMap((response) => {
      if (response.status === 'rejected') { warnings.push(`Rebid failed: ${response.reason instanceof Error ? response.reason.message : 'unknown error'}`); return []; }
      log(`Fresh A2A bid received from ${response.value.client.peer.displayName} for ${task.title}.`);
      return [{ peer: response.value.client.peer, bid: response.value.bid }];
    });
  }

  const currentHours = assignedHours(state);
  const newCapacity = event.newValue.newCapacity;
  const excess = Math.max(0, (currentHours[event.studentId] ?? 0) - newCapacity);
  const disruption = (allocation: TaskAllocation): number => {
    const ownerSkill = bidsByTask[allocation.taskId]?.find((record) => record.peer.studentId === allocation.studentId)?.bid.skillFit ?? 0;
    return calculateReassignmentPenalty(state.taskStatuses[allocation.taskId] ?? 'todo', ownerSkill);
  };
  const candidateSets = subsets(affected)
    .filter((set) => set.reduce((sum, item) => sum + item.estimatedHours, 0) >= excess)
    .sort((a, b) => a.length - b.length || a.reduce((sum, item) => sum + disruption(item), 0) - b.reduce((sum, item) => sum + disruption(item), 0));

  for (const moveSet of candidateSets) {
    const hours = { ...currentHours };
    for (const allocation of moveSet) hours[allocation.studentId] = (hours[allocation.studentId] ?? 0) - allocation.estimatedHours;
    const changes: PlanChange[] = [];
    const replacements: TaskAllocation[] = [];
    let feasible = true;
    for (const allocation of moveSet) {
      const options = (bidsByTask[allocation.taskId] ?? []).filter((record) => {
        const capacity = state.capacitySnapshot[record.peer.studentId]?.availableProjectHours ?? 0;
        return record.peer.studentId !== allocation.studentId && record.bid.willing && (hours[record.peer.studentId] ?? 0) + allocation.estimatedHours <= capacity;
      }).sort((a, b) => b.bid.overallFit - a.bid.overallFit || a.peer.studentId.localeCompare(b.peer.studentId));
      const winner = options[0];
      if (!winner) { feasible = false; break; }
      const available = state.capacitySnapshot[winner.peer.studentId]?.availableProjectHours ?? 0;
      const utilization = available === 0 ? 1 : (hours[winner.peer.studentId] ?? 0) / available;
      const score = round(winner.bid.overallFit * 100 - utilization * 20);
      hours[winner.peer.studentId] = (hours[winner.peer.studentId] ?? 0) + allocation.estimatedHours;
      replacements.push({ ...allocation, studentId: winner.peer.studentId, allocationScore: score, confidence: score >= 78 ? 'high' : score >= 55 ? 'medium' : 'low', reasoning: 'Fresh A2A bid selected with the smallest safe ownership change.' });
      changes.push({ taskId: allocation.taskId, oldStudentId: allocation.studentId, newStudentId: winner.peer.studentId, estimatedHours: allocation.estimatedHours, reason: 'Capacity decreased; this was the lowest-disruption safe reassignment supported by fresh A2A bids.' });
    }
    if (!feasible) continue;
    const movedIds = new Set(moveSet.map((allocation) => allocation.taskId));
    const unchanged = state.plan.allocations.filter((allocation) => !movedIds.has(allocation.taskId));
    const allocations = [...unchanged, ...replacements];
    const proposedPlan: ProjectPlan = {
      ...state.plan,
      id: `${project.id}-plan-v${state.planVersion + 1}`,
      version: state.planVersion + 1,
      status: 'proposed',
      allocations,
      warnings,
      fairnessSummary: fairness(allocations, state),
      createdAt: new Date().toISOString()
    };
    changes.forEach((change) => log(`${change.taskId}: ${change.oldStudentId} → ${change.newStudentId}.`));
    return { result: { previousPlanVersion: state.planVersion, proposedPlanVersion: proposedPlan.version, triggeringEvent: event, changedAllocations: changes, unchangedAllocations: unchanged, warnings, status: 'proposed', proposedPlan }, events, bidsByTask };
  }
  warnings.push('Remaining project work exceeds available safe team capacity.');
  return { ...empty('needs_team_decision', warnings), bidsByTask };
}
