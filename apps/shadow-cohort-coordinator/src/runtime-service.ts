import {
  approvePlan,
  calculateTeamFeasibility,
  createRuntimeState,
  requestChanges,
  shouldReplan,
  validateProjectEvent,
  type GroupProject,
  type PeerBidRecord,
  type PeerDescriptor,
  type ProjectEvent,
  type ProjectRuntimeState,
  type ReplanResult,
  type TeamFeasibilitySummary
} from '@shadow-cohort/core';
import { A2APeerClient } from './a2a-client';
import { CoordinatorAgent, type NegotiationEvent, type NegotiationResult } from './coordinator';
import { replanWithA2A } from './replanner';

export class ShadowCoordinatorRuntime {
  private negotiation?: NegotiationResult;
  private state?: ProjectRuntimeState;
  private replan?: ReplanResult;
  private bids: Record<string, PeerBidRecord[]> = {};
  private readonly eventLog: NegotiationEvent[] = [];
  private readonly connectedPeerIds = new Set<string>();

  constructor(readonly project: GroupProject, readonly peers: PeerDescriptor[], private readonly timeoutMs = 4_000) {}

  private log(message: string): void { this.eventLog.push({ at: new Date().toISOString(), message }); }

  async negotiate(): Promise<NegotiationResult> {
    this.replan = undefined;
    this.negotiation = await new CoordinatorAgent(this.peers, this.timeoutMs).negotiate(this.project);
    this.connectedPeerIds.clear();
    this.negotiation.connectedPeers.forEach((peer) => this.connectedPeerIds.add(peer.studentId));
    this.state = createRuntimeState(this.project, this.negotiation.plan, this.negotiation.capacities);
    this.bids = this.negotiation.bidsByTask;
    this.eventLog.push(...this.negotiation.events);
    this.log(`Plan v${this.state.planVersion} generated; human approval required.`);
    return this.negotiation;
  }

  approveCurrentPlan(): ProjectRuntimeState {
    if (!this.state) throw new Error('No plan is available for approval.');
    this.state.plan = approvePlan(this.state.plan);
    this.state.planHistory.push(this.state.plan);
    this.log(`Plan v${this.state.planVersion} approved by a human.`);
    return this.state;
  }

  async simulateStudentCOverload(): Promise<ReplanResult> {
    if (!this.state) throw new Error('Generate and approve an initial plan first.');
    const peer = this.peers.find((candidate) => candidate.studentId === 'student-c');
    if (!peer) throw new Error('Student C peer is unavailable.');
    const client = new A2APeerClient(peer, this.timeoutMs);
    const notice = await client.simulateAcademicOverload();
    if (notice.previousCapacity === notice.newCapacity) throw new Error('Student C is already overloaded. Reset the demo before replaying the workload change.');
    this.state.capacitySnapshot[notice.studentId] = await client.getCapacity();
    const event: ProjectEvent = {
      id: `capacity-change-${this.state.planVersion}-${Date.now()}`,
      type: 'ACADEMIC_LOAD_CHANGED',
      timestamp: new Date().toISOString(),
      studentId: notice.studentId,
      previousValue: { capacity: notice.previousCapacity },
      newValue: notice,
      source: 'student-agent-a2a'
    };
    if (!validateProjectEvent(event)) throw new Error('Refusing to record an unsafe project event.');
    this.log(`Student C safe capacity changed from ${notice.previousCapacity}h to ${notice.newCapacity}h: academic workload increased.`);
    this.log(shouldReplan(event, this.state) ? 'Replan required.' : 'No replan required.');
    const execution = await replanWithA2A(this.project, this.state, event, this.negotiation?.connectedPeers ?? this.peers, this.timeoutMs);
    this.eventLog.push(...execution.events);
    this.replan = execution.result;
    this.bids = { ...this.bids, ...execution.bidsByTask };
    if (this.replan.proposedPlan) {
      this.state.plan = this.replan.proposedPlan;
      this.state.planVersion = this.replan.proposedPlan.version;
      this.state.lastPlannedAt = this.replan.proposedPlan.createdAt;
      this.state.planHistory.push(this.replan.proposedPlan);
      this.log(`Plan v${this.state.planVersion} proposed; human approval required.`);
    } else if (this.replan.status === 'needs_team_decision') this.log('No safe reallocation found; team decision required.');
    return this.replan;
  }

  async resetDemo() {
    await Promise.all(this.peers.map((peer) => new A2APeerClient(peer, this.timeoutMs).resetDemo()));
    this.negotiation = undefined;
    this.state = undefined;
    this.replan = undefined;
    this.bids = {};
    this.eventLog.splice(0);
    this.log('Demo reset to the original happy-path workload. Run negotiation to create Plan v1.');
    return this.getStatus();
  }

  approveReplan(): ProjectRuntimeState {
    if (!this.state || !this.replan?.proposedPlan) throw new Error('No proposed replan is available.');
    this.state.plan = approvePlan(this.replan.proposedPlan);
    this.state.planVersion = this.state.plan.version;
    this.state.planHistory.push(this.state.plan);
    this.log(`Plan v${this.state.planVersion} approved by a human.`);
    return this.state;
  }

  rejectReplan(feedback?: string): ProjectRuntimeState {
    if (!this.state || !this.replan?.proposedPlan) throw new Error('No proposed replan is available.');
    this.state.plan = requestChanges(this.replan.proposedPlan, feedback);
    this.state.planVersion = this.state.plan.version;
    this.state.planHistory.push(this.state.plan);
    this.log(`Plan v${this.state.planVersion} changes requested${feedback ? ': feedback preserved.' : '.'}`);
    return this.state;
  }

  async getHealth(): Promise<{ status: 'ok' | 'degraded'; service: 'shadow-cohort'; peers: Record<string, 'connected' | 'offline'> }> {
    const results = await Promise.all(this.peers.map(async (peer) => {
      try {
        await new A2APeerClient(peer, Math.min(this.timeoutMs, 1_000)).discover();
        return [peer.studentId, 'connected'] as const;
      } catch {
        return [peer.studentId, 'offline'] as const;
      }
    }));
    for (const [studentId, state] of results) {
      const wasConnected = this.connectedPeerIds.has(studentId);
      if (state === 'connected') {
        this.connectedPeerIds.add(studentId);
        if (!wasConnected) this.log(`${this.peers.find((peer) => peer.studentId === studentId)?.displayName ?? studentId} connected via A2A.`);
      } else {
        this.connectedPeerIds.delete(studentId);
        if (wasConnected) this.log(`${this.peers.find((peer) => peer.studentId === studentId)?.displayName ?? studentId} disconnected.`);
      }
    }
    const peers = Object.fromEntries(results);
    return { status: results.every(([, state]) => state === 'connected') ? 'ok' : 'degraded', service: 'shadow-cohort', peers };
  }

  getStatus() {
    const capacities = this.state?.capacitySnapshot ?? this.negotiation?.capacities ?? {};
    const plan = this.state?.plan;
    const peerStatus = this.peers.map((peer) => {
      const capacity = capacities[peer.studentId];
      const allocatedHours = plan?.allocations.filter((allocation) => allocation.studentId === peer.studentId && this.state?.taskStatuses[allocation.taskId] !== 'done').reduce((sum, allocation) => sum + allocation.estimatedHours, 0) ?? 0;
      return { studentId: peer.studentId, displayName: peer.displayName, connected: this.connectedPeerIds.has(peer.studentId), capacity: capacity?.capacity, availableHours: capacity?.availableProjectHours ?? 0, allocatedHours, overloaded: capacity ? allocatedHours > capacity.availableProjectHours : false };
    });
    const feasibility: TeamFeasibilitySummary = calculateTeamFeasibility(this.project, capacities);
    return {
      peers: peerStatus,
      project: { id: this.project.id, title: this.project.title, totalEstimatedHours: feasibility.totalEstimatedProjectHours },
      feasibility,
      currentPlan: plan,
      planHistory: this.state ? [...this.state.planHistory] : [],
      currentReplan: this.replan,
      taskBids: this.bids,
      eventLog: [...this.eventLog]
    };
  }
}
