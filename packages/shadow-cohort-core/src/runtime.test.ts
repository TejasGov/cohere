import { describe, expect, it } from 'vitest';
import {
  calculateReassignmentPenalty,
  calculateTeamFeasibility,
  createRuntimeState,
  identifyAffectedTasks,
  shouldReplan,
  validateCapacityChangeNotice,
  validateProjectEvent,
  type GroupProject,
  type PeerCapacitySummary,
  type ProjectEvent,
  type ProjectPlan
} from './index';

const project: GroupProject = {
  id: 'p', title: 'Project', description: 'Fixture', deadline: '2026-10-01T00:00:00.000Z',
  tasks: [
    { id: 'ml', title: 'ML', description: '', requiredSkills: ['ML'], estimatedHours: 6, priority: 'high', dependencies: [] },
    { id: 'present', title: 'Presentation', description: '', requiredSkills: ['Presentation'], estimatedHours: 3, priority: 'medium', dependencies: [] },
    { id: 'other', title: 'Other', description: '', requiredSkills: [], estimatedHours: 4, priority: 'medium', dependencies: [] }
  ]
};
const plan: ProjectPlan = {
  id: 'plan-v1', projectId: 'p', version: 1, status: 'approved', createdAt: '2026-09-14T12:00:00.000Z', warnings: [], unallocatedTasks: [], fairnessSummary: {},
  allocations: [
    { taskId: 'ml', studentId: 'student-c', estimatedHours: 6, allocationScore: 90, confidence: 'high', reasoning: '' },
    { taskId: 'present', studentId: 'student-c', estimatedHours: 3, allocationScore: 80, confidence: 'high', reasoning: '' },
    { taskId: 'other', studentId: 'student-a', estimatedHours: 4, allocationScore: 80, confidence: 'high', reasoning: '' }
  ]
};
const capacity = (studentId: string, hours: number): PeerCapacitySummary => ({ studentId, capacity: hours < 5 ? 'low' : hours < 10 ? 'medium' : 'high', availableProjectHours: hours, strongSkills: [], constraints: [] });
const runtime = createRuntimeState(project, plan, { 'student-a': capacity('student-a', 12), 'student-c': capacity('student-c', 9) });
const event = (type: ProjectEvent['type'], fields: Partial<ProjectEvent> = {}): ProjectEvent => ({ id: type, type, timestamp: '2026-09-14T13:00:00.000Z', source: 'test', ...fields });
const notice = (newCapacity: number) => ({ studentId: 'student-c', previousCapacity: 9, newCapacity, capacityLevel: newCapacity < 5 ? 'low' as const : 'medium' as const, highLevelConstraint: 'academic workload increased' });

describe('team feasibility', () => {
  it('classifies tight and insufficient capacity', () => {
    expect(calculateTeamFeasibility(project, { a: capacity('a', 8), b: capacity('b', 6) })).toMatchObject({ totalEstimatedProjectHours: 13, totalSafeTeamHours: 14, capacityMargin: 1, status: 'tight' });
    expect(calculateTeamFeasibility(project, { a: capacity('a', 8) }).status).toBe('insufficient');
  });
});

describe('project events and replan decision', () => {
  it('validates privacy-safe capacity changes and project events', () => {
    expect(validateCapacityChangeNotice(notice(6))).toBe(true);
    expect(validateCapacityChangeNotice({ ...notice(6), courseName: 'Private' })).toBe(false);
    expect(validateProjectEvent(event('ACADEMIC_LOAD_CHANGED', { studentId: 'student-c', newValue: notice(6) }))).toBe(true);
  });
  it('triggers for overload but not harmless capacity change', () => {
    expect(shouldReplan(event('ACADEMIC_LOAD_CHANGED', { studentId: 'student-c', newValue: notice(6) }), runtime)).toBe(true);
    expect(shouldReplan(event('STUDENT_AVAILABILITY_CHANGED', { studentId: 'student-c', newValue: notice(9) }), runtime)).toBe(false);
  });
  it('handles unavailable, estimate, blocked, completed, deadline, and new-task events', () => {
    expect(shouldReplan(event('STUDENT_UNAVAILABLE', { studentId: 'student-c' }), runtime)).toBe(true);
    expect(shouldReplan(event('TASK_ESTIMATE_CHANGED', { taskId: 'ml', previousValue: 6, newValue: 8 }), runtime)).toBe(true);
    expect(shouldReplan(event('TASK_BLOCKED', { taskId: 'ml' }), runtime)).toBe(true);
    expect(shouldReplan(event('TASK_COMPLETED', { taskId: 'ml' }), runtime)).toBe(false);
    expect(shouldReplan(event('PROJECT_DEADLINE_CHANGED', { previousValue: '2026-10-01T00:00:00Z', newValue: '2026-09-25T00:00:00Z' }), runtime)).toBe(true);
    expect(shouldReplan(event('NEW_PROJECT_TASK', { taskId: 'new' }), runtime)).toBe(true);
  });
});

describe('affected tasks and disruption', () => {
  it('selects only the affected student unfinished work and preserves unrelated owners', () => {
    const changed = { ...runtime, taskStatuses: { ...runtime.taskStatuses, ml: 'done' as const } };
    expect(identifyAffectedTasks(event('ACADEMIC_LOAD_CHANGED', { studentId: 'student-c', newValue: notice(6) }), changed)).toEqual(['present']);
    expect(identifyAffectedTasks(event('TASK_COMPLETED', { taskId: 'ml' }), changed)).toEqual([]);
  });
  it('forbids completed movement and strongly penalizes in-progress movement', () => {
    expect(calculateReassignmentPenalty('done', 0)).toBe(Infinity);
    expect(calculateReassignmentPenalty('in_progress', 0.5)).toBeGreaterThan(calculateReassignmentPenalty('todo', 1));
  });
});
