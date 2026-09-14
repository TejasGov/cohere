import { describe, expect, it } from 'vitest';
import {
  allocateProject,
  approvePlan,
  calculateAllocationScore,
  requestPlanChanges,
  toPeerTaskBidResponse,
  validateGroupProject,
  validatePeerTaskBidResponse,
  validateProjectPlan,
  type GroupProject,
  type PeerBidRecord,
  type PeerCapacitySummary,
  type PeerDescriptor,
  type ProjectPlan,
  type TaskBid
} from './index';

const peers: PeerDescriptor[] = [
  { studentId: 'a', displayName: 'A', endpoint: 'http://127.0.0.1:1' },
  { studentId: 'b', displayName: 'B', endpoint: 'http://127.0.0.1:2' }
];
const capacities: Record<string, PeerCapacitySummary> = {
  a: { studentId: 'a', capacity: 'high', availableProjectHours: 8, strongSkills: ['Python'], constraints: [] },
  b: { studentId: 'b', capacity: 'high', availableProjectHours: 8, strongSkills: ['React'], constraints: [] }
};
const peerA = peers[0] ?? (() => { throw new Error('Missing peer A fixture.'); })();
const project: GroupProject = {
  id: 'project', title: 'Project', description: 'Fixture', deadline: '2026-10-01T00:00:00.000Z',
  tasks: [
    { id: 'one', title: 'One', description: 'One', requiredSkills: ['Python'], estimatedHours: 6, priority: 'high', dependencies: [] },
    { id: 'two', title: 'Two', description: 'Two', requiredSkills: ['Python'], estimatedHours: 4, priority: 'medium', dependencies: [] }
  ]
};

function bid(studentId: string, taskId: string, overallFit: number, willing = true): PeerBidRecord {
  return {
    peer: peers.find((peer) => peer.studentId === studentId) ?? peerA,
    bid: { studentId, taskId, skillFit: overallFit, capacityFit: 1, preferenceFit: 0.75, overallFit, willing, estimatedAvailableHours: 8, explanation: 'Privacy-safe fixture explanation.' }
  };
}

describe('coordination schemas', () => {
  it('validates GroupProject and rejects duplicate tasks', () => {
    expect(validateGroupProject(project)).toEqual([]);
    expect(validateGroupProject({ ...project, tasks: [project.tasks[0], project.tasks[0]] })).toContain('tasks[1].id is duplicated.');
  });
  it('validates ProjectPlan', () => {
    const plan = allocateProject({ project, peers, capacities, bidsByTask: { one: [bid('a', 'one', 0.9)], two: [bid('b', 'two', 0.8)] } });
    expect(validateProjectPlan(plan)).toEqual([]);
    expect(validateProjectPlan({ ...plan, status: 'complete' })).toContain('status is invalid.');
  });
  it('rejects malformed or privacy-expanded outbound bids', () => {
    expect(validatePeerTaskBidResponse({ ...bid('a', 'one', 0.9).bid, courseName: 'private' })).toBe(false);
    expect(validatePeerTaskBidResponse({ ...bid('a', 'one', 0.9).bid, overallFit: 2 })).toBe(false);
    expect(validatePeerTaskBidResponse({ ...bid('a', 'one', 0.9).bid, willing: 'yes' })).toBe(false);
  });
  it('whitelists outbound bid fields and strips attached academic state', () => {
    const unsafe = Object.assign({ ...bid('a', 'one', 0.9).bid } as TaskBid, { academicState: { courses: ['Private Course'] }, sourceUrl: 'https://lms.invalid' });
    const outbound = JSON.stringify(toPeerTaskBidResponse(unsafe));
    expect(outbound).not.toContain('Private Course');
    expect(outbound).not.toContain('sourceUrl');
  });
});

describe('allocation engine', () => {
  it('scores willing feasible bids and rejects capacity violations', () => {
    expect(calculateAllocationScore(bid('a', 'one', 0.9).bid, 8, 0, 8, 6)).toBeGreaterThan(90);
    expect(calculateAllocationScore(bid('a', 'one', 0.9).bid, 5, 0, 8, 6)).toBeUndefined();
  });
  it('applies a fairness penalty as utilization increases', () => {
    const response = bid('a', 'one', 0.9).bid;
    const penalized = calculateAllocationScore(response, 4, 4, 8, 2);
    expect(penalized).toBeDefined();
    expect(calculateAllocationScore(response, 8, 0, 8, 2)).toBeGreaterThan(penalized ?? Infinity);
  });
  it('updates remaining capacity and uses the next viable peer in round two', () => {
    const plan = allocateProject({
      project, peers, capacities,
      bidsByTask: { one: [bid('a', 'one', 0.95), bid('b', 'one', 0.6)], two: [bid('a', 'two', 0.9), bid('b', 'two', 0.8)] }
    });
    expect(plan.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'one', studentId: 'a' }),
      expect.objectContaining({ taskId: 'two', studentId: 'b' })
    ]));
    expect(plan.fairnessSummary.a).toMatchObject({ allocatedHours: 6, utilization: 0.75 });
    expect(plan.fairnessSummary.b).toMatchObject({ allocatedHours: 4, utilization: 0.5 });
  });
  it('leaves a task unallocated when nobody is willing and safe', () => {
    const firstTask = project.tasks[0];
    if (!firstTask) throw new Error('Missing task fixture.');
    const plan = allocateProject({ project: { ...project, tasks: [firstTask] }, peers, capacities, bidsByTask: { one: [bid('a', 'one', 0.9, false)] } });
    expect(plan.unallocatedTasks).toHaveLength(1);
    expect(plan.allocations).toHaveLength(0);
  });
  it('preserves partial plans and warnings', () => {
    const plan = allocateProject({ project, peers, capacities, bidsByTask: { one: [bid('a', 'one', 0.9)] }, warnings: ['B offline.'] });
    expect(plan.allocations).toHaveLength(1);
    expect(plan.unallocatedTasks).toHaveLength(1);
    expect(plan.warnings).toContain('B offline.');
  });
});

describe('human approval', () => {
  const plan: ProjectPlan = {
    id: 'p', projectId: 'project', version: 1, status: 'proposed', allocations: [], unallocatedTasks: [], warnings: [], fairnessSummary: {}, createdAt: '2026-09-06T00:00:00.000Z'
  };
  it('approves explicitly without changing the allocation version', () => expect(approvePlan(plan)).toMatchObject({ status: 'approved', version: 1 }));
  it('preserves requested-change feedback without changing the allocation version', () => expect(requestPlanChanges(plan, 'Student B does not want presentation work.')).toMatchObject({ status: 'changes_requested', version: 1, feedback: 'Student B does not want presentation work.' }));
});
