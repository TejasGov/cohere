import type { PeerCapacitySummary } from './schema';
import type { FairnessEntry, GroupProject, PeerBidRecord, PeerDescriptor, ProjectPlan, TaskAllocation } from './coordination';

export interface AllocationInput {
  project: GroupProject;
  peers: PeerDescriptor[];
  capacities: Record<string, PeerCapacitySummary | undefined>;
  bidsByTask: Record<string, PeerBidRecord[] | undefined>;
  warnings?: string[];
  now?: Date;
}

const PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Deterministic score for feasible/willing bids:
 * overallFit × 100, minus a 20-point current-utilization fairness penalty,
 * plus up to 4 points for remaining-capacity headroom. Infeasible bids are rejected.
 */
export function calculateAllocationScore(bid: PeerBidRecord['bid'], remainingCapacity: number, currentAssignedHours: number, availableHours: number, taskHours: number): number | undefined {
  if (!bid.willing || taskHours > remainingCapacity || availableHours <= 0) return undefined;
  const utilization = currentAssignedHours / availableHours;
  const headroom = Math.min(2, remainingCapacity / Math.max(taskHours, 0.1)) * 2;
  return round(bid.overallFit * 100 - utilization * 20 + headroom);
}

function confidence(score: number): TaskAllocation['confidence'] {
  if (score >= 78) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

export function allocateProject(input: AllocationInput): ProjectPlan {
  const available = Object.fromEntries(input.peers.map((peer) => [peer.studentId, input.capacities[peer.studentId]?.availableProjectHours ?? 0]));
  const allocated = Object.fromEntries(input.peers.map((peer) => [peer.studentId, 0]));
  const indexedTasks = input.project.tasks.map((task, index) => ({ task, index }));
  indexedTasks.sort((a, b) => PRIORITY[a.task.priority] - PRIORITY[b.task.priority] || a.index - b.index);
  const allocations: TaskAllocation[] = [];
  const unallocatedTasks: ProjectPlan['unallocatedTasks'] = [];

  for (const { task } of indexedTasks) {
    const candidates = (input.bidsByTask[task.id] ?? []).flatMap((record) => {
      const safeHours = available[record.peer.studentId] ?? 0;
      const assignedHours = allocated[record.peer.studentId] ?? 0;
      const score = calculateAllocationScore(record.bid, safeHours - assignedHours, assignedHours, safeHours, task.estimatedHours);
      return score === undefined ? [] : [{ record, score }];
    });
    candidates.sort((a, b) => b.score - a.score || a.record.peer.studentId.localeCompare(b.record.peer.studentId));
    const winner = candidates[0];
    if (!winner) {
      unallocatedTasks.push({ taskId: task.id, estimatedHours: task.estimatedHours, reason: 'No willing teammate has enough remaining safe project capacity.' });
      continue;
    }
    allocated[winner.record.peer.studentId] = (allocated[winner.record.peer.studentId] ?? 0) + task.estimatedHours;
    allocations.push({
      taskId: task.id,
      studentId: winner.record.peer.studentId,
      estimatedHours: task.estimatedHours,
      allocationScore: winner.score,
      confidence: confidence(winner.score),
      reasoning: `Highest safe deterministic allocation score (${winner.score}) after skill, capacity, and fairness checks.`
    });
  }

  const fairnessSummary: Record<string, FairnessEntry> = {};
  for (const peer of input.peers) {
    const availableHours = available[peer.studentId] ?? 0;
    const allocatedHours = allocated[peer.studentId] ?? 0;
    fairnessSummary[peer.studentId] = { allocatedHours, availableHours, utilization: availableHours === 0 ? 0 : round(allocatedHours / availableHours) };
  }
  const totalUnallocated = unallocatedTasks.reduce((sum, item) => sum + item.estimatedHours, 0);
  const warnings = [...(input.warnings ?? [])];
  if (totalUnallocated > 0) warnings.push(`${totalUnallocated} project hours remain unallocated because no safe willing assignment was available.`);
  return {
    id: `${input.project.id}-plan-v1`, projectId: input.project.id, version: 1, status: 'proposed', allocations, unallocatedTasks, warnings, fairnessSummary,
    createdAt: (input.now ?? new Date()).toISOString()
  };
}
