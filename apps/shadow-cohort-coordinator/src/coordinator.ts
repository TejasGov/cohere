import {
  allocateProject,
  approvePlan,
  calculateTeamFeasibility,
  requestChanges,
  validateGroupProject,
  type GroupProject,
  type PeerBidRecord,
  type PeerCapacitySummary,
  type PeerDescriptor,
  type ProjectPlan,
  type TeamFeasibilitySummary
} from '@shadow-cohort/core';
import { A2APeerClient } from './a2a-client';

export interface NegotiationEvent { at: string; message: string; }
export interface NegotiationResult { plan: ProjectPlan; events: NegotiationEvent[]; connectedPeers: PeerDescriptor[]; bidsByTask: Record<string, PeerBidRecord[]>; capacities: Record<string, PeerCapacitySummary>; feasibility: TeamFeasibilitySummary; }

export class CoordinatorAgent {
  constructor(private readonly peers: PeerDescriptor[], private readonly timeoutMs = 4_000) {}

  async negotiate(project: GroupProject): Promise<NegotiationResult> {
    const validation = validateGroupProject(project);
    if (validation.length > 0) throw new Error(`Invalid GroupProject: ${validation.join(' ')}`);
    const events: NegotiationEvent[] = [];
    const warnings: string[] = [];
    const log = (message: string): void => { events.push({ at: new Date().toISOString(), message }); };
    const clients: A2APeerClient[] = [];

    await Promise.all(this.peers.map(async (peer) => {
      const client = new A2APeerClient(peer, this.timeoutMs);
      try {
        await client.discover();
        clients.push(client);
        log(`Coordinator discovered ${peer.displayName} via A2A agent card.`);
      } catch (error) {
        warnings.push(`${peer.displayName} could not participate in negotiation: ${error instanceof Error ? error.message : 'unknown discovery error'}`);
        log(`Peer unavailable: ${peer.displayName}.`);
      }
    }));
    clients.sort((a, b) => a.peer.studentId.localeCompare(b.peer.studentId));

    const capacities: Record<string, PeerCapacitySummary> = {};
    const capacityResults = await Promise.allSettled(clients.map(async (client) => ({ client, capacity: await client.getCapacity() })));
    for (const result of capacityResults) {
      if (result.status === 'fulfilled') capacities[result.value.client.peer.studentId] = result.value.capacity;
      else warnings.push(`A peer capacity request failed: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`);
    }

    const bidsByTask: Record<string, PeerBidRecord[]> = {};
    const seen = new Set<string>();
    for (const task of project.tasks) {
      log(`Task broadcast: ${task.title}.`);
      const settled = await Promise.allSettled(clients.map(async (client) => ({ client, bid: await client.evaluateTask(task) })));
      bidsByTask[task.id] = [];
      for (const result of settled) {
        if (result.status === 'rejected') {
          warnings.push(`A task bid failed for ${task.title}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`);
          continue;
        }
        const key = `${task.id}:${result.value.bid.studentId}`;
        if (seen.has(key)) { warnings.push(`Duplicate response ignored for ${key}.`); continue; }
        seen.add(key);
        bidsByTask[task.id]?.push({ peer: result.value.client.peer, bid: result.value.bid });
        log(`Bid received: ${result.value.client.peer.displayName} for ${task.title}.`);
      }
    }

    const connectedPeers = clients.map((client) => client.peer);
    if (connectedPeers.length < this.peers.length) warnings.push(`${connectedPeers.length}/${this.peers.length} peer agents were available; partial planning continued.`);
    const plan = allocateProject({ project, peers: connectedPeers, capacities, bidsByTask, warnings });
    for (const allocation of plan.allocations) log(`${allocation.taskId} → ${allocation.studentId}.`);
    for (const task of plan.unallocatedTasks) log(`${task.taskId} → UNALLOCATED.`);
    return { plan, events, connectedPeers, bidsByTask, capacities, feasibility: calculateTeamFeasibility(project, capacities) };
  }

  approvePlan(plan: ProjectPlan): ProjectPlan { return approvePlan(plan); }

  requestChanges(plan: ProjectPlan, feedback?: string): ProjectPlan { return requestChanges(plan, feedback); }
}
