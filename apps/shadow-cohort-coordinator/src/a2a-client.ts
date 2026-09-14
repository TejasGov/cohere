import { A2AAgent } from '@strands-agents/sdk/a2a';
import {
  validatePeerCapacitySummary,
  validatePeerTaskBidResponse,
  validateCapacityChangeNotice,
  type CapacityChangeNotice,
  type PeerCapacitySummary,
  type PeerDescriptor,
  type PeerTaskBidResponse,
  type ProjectTask
} from '@shadow-cohort/core';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

export class A2APeerClient {
  private readonly remote: A2AAgent;

  constructor(readonly peer: PeerDescriptor, private readonly timeoutMs = 4_000) {
    this.remote = new A2AAgent({ url: peer.endpoint, id: peer.studentId });
  }

  async discover(): Promise<{ name: string; skills: string[] }> {
    const response = await withTimeout(fetch(`${this.peer.endpoint}/.well-known/agent-card.json`), this.timeoutMs, `${this.peer.displayName} discovery`);
    if (!response.ok) throw new Error(`Agent-card discovery returned HTTP ${response.status}.`);
    const card: unknown = await response.json();
    if (typeof card !== 'object' || card === null || !('name' in card) || typeof card.name !== 'string') throw new Error('Malformed A2A agent card.');
    const skills = 'skills' in card && Array.isArray(card.skills)
      ? card.skills.flatMap((skill) => typeof skill === 'object' && skill !== null && 'id' in skill && typeof skill.id === 'string' ? [skill.id] : [])
      : [];
    if (!skills.includes('evaluate_project_task') || !skills.includes('get_peer_capacity_summary')) throw new Error('Peer is missing required A2A capabilities.');
    return { name: card.name, skills };
  }

  private async invoke(payload: unknown): Promise<unknown> {
    const result = await withTimeout(this.remote.invoke(JSON.stringify(payload)), this.timeoutMs, `${this.peer.displayName} A2A request`);
    try { return JSON.parse(result.toString()); }
    catch { throw new Error('Peer returned malformed JSON.'); }
  }

  async getCapacity(): Promise<PeerCapacitySummary> {
    const value = await this.invoke({ operation: 'get_peer_capacity_summary' });
    if (!validatePeerCapacitySummary(value) || value.studentId !== this.peer.studentId) throw new Error('Peer returned an invalid capacity summary.');
    return value;
  }

  async evaluateTask(task: ProjectTask): Promise<PeerTaskBidResponse> {
    const value = await this.invoke({ operation: 'evaluate_project_task', task });
    if (!validatePeerTaskBidResponse(value) || value.studentId !== this.peer.studentId || value.taskId !== task.id) throw new Error('Peer returned an invalid or mismatched TaskBid.');
    return value;
  }

  async simulateAcademicOverload(): Promise<CapacityChangeNotice> {
    const value = await this.invoke({ operation: 'simulate_academic_overload' });
    if (!validateCapacityChangeNotice(value) || value.studentId !== this.peer.studentId) throw new Error('Peer returned an invalid capacity-change notice.');
    return value;
  }
}
