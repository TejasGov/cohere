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

  constructor(readonly project: GroupProject, readonly peers: PeerDescriptor[], private readonly timeoutMs = 4_000) {}

  private log(message: string): void { this.eventLog.push({ at: new Date().toISOString(), message }); }

  async negotiate(): Promise<NegotiationResult> {
    this.negotiation = await new CoordinatorAgent(this.peers, this.timeoutMs).negotiate(this.project);
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

  approveReplan(): ProjectRuntimeState {
    if (!this.state || !this.replan?.proposedPlan) throw new Error('No proposed replan is available.');
    this.state.plan = approvePlan(this.state.plan);
    this.state.planHistory.push(this.state.plan);
    this.log(`Plan v${this.state.planVersion} approved by a human.`);
    return this.state;
  }

  rejectReplan(feedback?: string): ProjectRuntimeState {
    if (!this.state || !this.replan) throw new Error('No replan is available.');
    this.state.plan = requestChanges(this.state.plan, feedback);
    this.state.planHistory.push(this.state.plan);
    this.log(`Plan v${this.state.planVersion} changes requested${feedback ? ': feedback preserved.' : '.'}`);
    return this.state;
  }

  getStatus() {
    const capacities = this.state?.capacitySnapshot ?? this.negotiation?.capacities ?? {};
    const plan = this.state?.plan;
    const connected = new Set(this.negotiation?.connectedPeers.map((peer) => peer.studentId) ?? []);
    const peerStatus = this.peers.map((peer) => {
      const capacity = capacities[peer.studentId];
      const allocatedHours = plan?.allocations.filter((allocation) => allocation.studentId === peer.studentId && this.state?.taskStatuses[allocation.taskId] !== 'done').reduce((sum, allocation) => sum + allocation.estimatedHours, 0) ?? 0;
      return { studentId: peer.studentId, displayName: peer.displayName, connected: connected.has(peer.studentId), capacity: capacity?.capacity, availableHours: capacity?.availableProjectHours ?? 0, allocatedHours, overloaded: capacity ? allocatedHours > capacity.availableProjectHours : false };
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
