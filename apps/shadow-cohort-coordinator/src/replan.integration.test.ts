import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { happyPathTeamScenario } from '@shadow-cohort/agent/scenarios';
import { startPeerServer, type RunningPeer } from '@shadow-cohort/peer';
import {
  createRuntimeState,
  type CapacityChangeNotice,
  type PeerCapacitySummary,
  type ProjectEvent
} from '@shadow-cohort/core';
import { startDashboardApi } from './api';
import { CoordinatorAgent } from './coordinator';
import { campusMarketplaceProject } from './project';
import { replanWithA2A } from './replanner';
import { ShadowCoordinatorRuntime } from './runtime-service';

const now = new Date('2026-09-06T12:00:00.000Z');
let peers: RunningPeer[] = [];

function fixture(studentId: string) {
  const value = happyPathTeamScenario.students[studentId];
  if (!value) throw new Error(`Missing fixture for ${studentId}.`);
  return value;
}

async function startHappyPeers(): Promise<RunningPeer[]> {
  return Promise.all(['student-a', 'student-b', 'student-c'].map((studentId) => {
    const value = fixture(studentId);
    return startPeerServer({ profile: value.profile, academicState: value.academicState, overloadAcademicState: value.overloadAcademicState, now, port: 0 });
  }));
}

function stopPeers(running: RunningPeer[]): void {
  running.forEach((peer) => peer.stop());
}

function peerAt(running: RunningPeer[], index: number): RunningPeer {
  const peer = running[index];
  if (!peer) throw new Error(`Missing peer fixture at index ${index}.`);
  return peer;
}

function capacityAt(capacities: Record<string, PeerCapacitySummary>, studentId: string): PeerCapacitySummary {
  const capacity = capacities[studentId];
  if (!capacity) throw new Error(`Missing capacity fixture for ${studentId}.`);
  return capacity;
}

function capacityNotice(): CapacityChangeNotice {
  return { studentId: 'student-c', previousCapacity: 9.6, newCapacity: 6, capacityLevel: 'medium', highLevelConstraint: 'academic workload increased' };
}

function capacityEvent(): ProjectEvent {
  return { id: 'capacity-change-test', type: 'ACADEMIC_LOAD_CHANGED', timestamp: now.toISOString(), studentId: 'student-c', previousValue: { capacity: 9.6 }, newValue: capacityNotice(), source: 'student-agent-a2a' };
}

beforeAll(async () => { peers = await startHappyPeers(); });
afterAll(() => { stopPeers(peers); });

describe.sequential('workload-driven replanning over real localhost A2A', () => {
  it('negotiates a feasible six-task v1 plan, changes only Presentation after overload, and preserves privacy', async () => {
    const runtime = new ShadowCoordinatorRuntime(campusMarketplaceProject, peers.map((peer) => peer.descriptor));
    const initial = await runtime.negotiate();

    expect(initial.connectedPeers).toHaveLength(3);
    expect(initial.feasibility).toEqual({ totalEstimatedProjectHours: 34, totalSafeTeamHours: 37.6, capacityMargin: 3.6, status: 'tight' });
    expect(initial.plan).toMatchObject({ version: 1, status: 'proposed', unallocatedTasks: [] });
    expect(initial.plan.allocations).toHaveLength(6);
    for (const [studentId, summary] of Object.entries(initial.plan.fairnessSummary)) expect(summary.allocatedHours).toBeLessThanOrEqual(initial.capacities[studentId]?.availableProjectHours ?? 0);
    for (const task of campusMarketplaceProject.tasks) expect(initial.bidsByTask[task.id]).toHaveLength(3);
    expect(initial.plan.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'backend-api', studentId: 'student-a' }),
      expect.objectContaining({ taskId: 'database-schema', studentId: 'student-a' }),
      expect.objectContaining({ taskId: 'frontend-ui', studentId: 'student-b' }),
      expect.objectContaining({ taskId: 'integration-testing', studentId: 'student-b' }),
      expect.objectContaining({ taskId: 'recommendation-model', studentId: 'student-c' }),
      expect.objectContaining({ taskId: 'presentation', studentId: 'student-c' })
    ]));
    expect(runtime.approveCurrentPlan().plan).toMatchObject({ version: 1, status: 'approved' });

    const result = await runtime.simulateStudentCOverload();
    expect(result).toMatchObject({ previousPlanVersion: 1, proposedPlanVersion: 2, status: 'proposed' });
    expect(result.changedAllocations).toEqual([
      expect.objectContaining({ taskId: 'presentation', oldStudentId: 'student-c', newStudentId: 'student-b', estimatedHours: 3 })
    ]);
    expect(result.unchangedAllocations).toHaveLength(5);
    expect(result.proposedPlan?.allocations).toHaveLength(6);
    expect(result.proposedPlan?.fairnessSummary).toMatchObject({
      'student-a': { allocatedHours: 12, availableHours: 12 },
      'student-b': { allocatedHours: 16, availableHours: 16 },
      'student-c': { allocatedHours: 6, availableHours: 6 }
    });

    const status = runtime.getStatus();
    expect(status.planHistory.map((plan) => [plan.version, plan.status])).toEqual([
      [1, 'proposed'], [1, 'approved'], [2, 'proposed']
    ]);
    expect(status.taskBids['recommendation-model']).toHaveLength(3);
    expect(status.taskBids['presentation']).toHaveLength(3);
    expect(status.eventLog.filter((event) => event.message.startsWith('Fresh A2A bid received'))).toHaveLength(6);
    const serialized = JSON.stringify(status);
    for (const forbidden of ['private-pressure-item', 'private-course', 'sourceUrl', '2026-09-10T20:00:00.000Z']) expect(serialized).not.toContain(forbidden);
    expect(runtime.approveReplan().plan).toMatchObject({ version: 2, status: 'approved' });
    await expect(runtime.simulateStudentCOverload()).rejects.toThrow('Reset the demo');
    const reset = await runtime.resetDemo();
    expect(reset.currentPlan).toBeUndefined();
    expect(reset.eventLog.at(-1)?.message).toContain('Demo reset');
    const replay = await runtime.negotiate();
    expect(replay.capacities['student-c']?.availableProjectHours).toBe(9.6);
    expect(replay.plan.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'presentation', studentId: 'student-c' })
    ]));
  });

  it('escalates instead of forcing an unsafe reallocation', async () => {
    const testPeers = await startHappyPeers();
    try {
      const initial = await new CoordinatorAgent(testPeers.map((peer) => peer.descriptor)).negotiate(campusMarketplaceProject);
      const capacities: Record<string, PeerCapacitySummary> = {
        ...initial.capacities,
        'student-b': { ...capacityAt(initial.capacities, 'student-b'), availableProjectHours: 13 },
        'student-c': { ...capacityAt(initial.capacities, 'student-c'), availableProjectHours: 6, capacity: 'medium' }
      };
      const state = createRuntimeState(campusMarketplaceProject, initial.plan, capacities);
      const result = await replanWithA2A(campusMarketplaceProject, state, capacityEvent(), testPeers.map((peer) => peer.descriptor));
      expect(result.result.status).toBe('needs_team_decision');
      expect(result.result.changedAllocations).toHaveLength(0);
      expect(result.result.warnings.join(' ')).toContain('exceeds available safe team capacity');
    } finally { stopPeers(testPeers); }
  });

  it('continues safely when a peer is offline during rebidding', async () => {
    const testPeers = await startHappyPeers();
    try {
      const initial = await new CoordinatorAgent(testPeers.map((peer) => peer.descriptor)).negotiate(campusMarketplaceProject);
      const state = createRuntimeState(campusMarketplaceProject, initial.plan, {
        ...initial.capacities,
        'student-c': { ...capacityAt(initial.capacities, 'student-c'), availableProjectHours: 6, capacity: 'medium' }
      });
      const descriptors = [peerAt(testPeers, 0).descriptor, { studentId: 'student-b', displayName: 'Student B offline', endpoint: 'http://127.0.0.1:1' }, peerAt(testPeers, 2).descriptor];
      const execution = await replanWithA2A(campusMarketplaceProject, state, capacityEvent(), descriptors, 100);
      expect(execution.result.status).toBe('needs_team_decision');
      expect(execution.result.warnings.join(' ')).toContain('Rebid failed');
      expect(execution.result.changedAllocations).toHaveLength(0);
    } finally { stopPeers(testPeers); }
  });

  it('times out an unresponsive peer during rebidding and requests a team decision', async () => {
    const testPeers = await startHappyPeers();
    const sockets = new Set<Socket>();
    const hanging = createServer(() => undefined);
    hanging.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', resolve));
    try {
      const initial = await new CoordinatorAgent(testPeers.map((peer) => peer.descriptor)).negotiate(campusMarketplaceProject);
      const state = createRuntimeState(campusMarketplaceProject, initial.plan, {
        ...initial.capacities,
        'student-c': { ...capacityAt(initial.capacities, 'student-c'), availableProjectHours: 6, capacity: 'medium' }
      });
      const address = hanging.address();
      if (address === null || typeof address === 'string') throw new Error('Hanging peer did not bind.');
      const descriptors = [peerAt(testPeers, 0).descriptor, { studentId: 'student-b', displayName: 'Student B slow', endpoint: `http://127.0.0.1:${address.port}` }, peerAt(testPeers, 2).descriptor];
      const execution = await replanWithA2A(campusMarketplaceProject, state, capacityEvent(), descriptors, 50);
      expect(execution.result.status).toBe('needs_team_decision');
      expect(execution.result.warnings.join(' ')).toContain('timed out');
    } finally {
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve) => hanging.close(() => resolve()));
      stopPeers(testPeers);
    }
  });

  it('never assigns work when every teammate has zero safe headroom', async () => {
    const testPeers = await startHappyPeers();
    try {
      const initial = await new CoordinatorAgent(testPeers.map((peer) => peer.descriptor)).negotiate(campusMarketplaceProject);
      const capacities = Object.fromEntries(Object.entries(initial.capacities).map(([studentId, value]) => [studentId, { ...value, availableProjectHours: studentId === 'student-c' ? 6 : initial.plan.fairnessSummary[studentId]?.allocatedHours ?? 0 }]));
      const state = createRuntimeState(campusMarketplaceProject, initial.plan, capacities);
      const execution = await replanWithA2A(campusMarketplaceProject, state, capacityEvent(), testPeers.map((peer) => peer.descriptor));
      expect(execution.result.status).toBe('needs_team_decision');
      expect(execution.result.changedAllocations).toHaveLength(0);
      expect(execution.result.proposedPlan).toBeUndefined();
    } finally { stopPeers(testPeers); }
  });
});

describe('privacy-safe dashboard API', () => {
  it('exposes negotiation, approval, overload, status, and rejection endpoints without academic details', async () => {
    const apiPeers = await startHappyPeers();
    const runtime = new ShadowCoordinatorRuntime(campusMarketplaceProject, apiPeers.map((peer) => peer.descriptor));
    const api = await startDashboardApi(runtime, 0);
    try {
      const negotiate = await fetch(`${api.endpoint}/api/shadow/negotiate`, { method: 'POST' });
      expect(negotiate.status).toBe(200);
      const approve = await fetch(`${api.endpoint}/api/shadow/plan/approve`, { method: 'POST' });
      expect(approve.status).toBe(200);
      const overload = await fetch(`${api.endpoint}/api/shadow/demo/student-c-overload`, { method: 'POST' });
      expect(overload.status).toBe(200);
      const reject = await fetch(`${api.endpoint}/api/shadow/replan/reject`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ feedback: 'Discuss this change together.' })
      });
      expect(reject.status).toBe(200);
      expect(await reject.clone().json()).toMatchObject({ plan: { version: 2, status: 'changes_requested' } });
      const approveReplan = await fetch(`${api.endpoint}/api/shadow/replan/approve`, { method: 'POST' });
      expect(approveReplan.status).toBe(200);
      const completedStatus = await fetch(`${api.endpoint}/api/shadow/status`);
      const completedBody = await completedStatus.text();
      expect(completedBody).toContain('changes_requested');
      expect(completedBody).toContain('approved');
      expect(completedBody).toContain('academic workload increased');
      const reset = await fetch(`${api.endpoint}/api/shadow/demo/reset`, { method: 'POST' });
      expect(reset.status).toBe(200);
      expect(await reset.clone().json()).not.toHaveProperty('currentPlan');
      const replay = await fetch(`${api.endpoint}/api/shadow/negotiate`, { method: 'POST' });
      expect(replay.status).toBe(200);
      expect(await replay.clone().json()).toMatchObject({ capacities: { 'student-c': { availableProjectHours: 9.6 } } });
      const statusResponse = await fetch(`${api.endpoint}/api/shadow/status`);
      expect(statusResponse.status).toBe(200);
      const body = await statusResponse.text();
      for (const forbidden of ['private-pressure-item', 'private-course', 'sourceUrl', '2026-09-10T20:00:00.000Z']) expect(body).not.toContain(forbidden);
    } finally {
      await api.stop();
      stopPeers(apiPeers);
    }
  });
});
