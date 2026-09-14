import type { PeerCapacitySummary } from './schema';
import type { GroupProject, ProjectPlan, TaskAllocation } from './coordination';

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type ProjectEventType = 'ACADEMIC_LOAD_CHANGED' | 'STUDENT_AVAILABILITY_CHANGED' | 'STUDENT_UNAVAILABLE' | 'TASK_ESTIMATE_CHANGED' | 'TASK_BLOCKED' | 'TASK_COMPLETED' | 'PROJECT_DEADLINE_CHANGED' | 'NEW_PROJECT_TASK';

export interface ProjectEvent { id: string; type: ProjectEventType; timestamp: string; studentId?: string; taskId?: string; previousValue?: unknown; newValue?: unknown; source: string; }
export interface CapacityChangeNotice { studentId: string; previousCapacity: number; newCapacity: number; capacityLevel: 'low' | 'medium' | 'high'; highLevelConstraint: string; }
export interface ProjectRuntimeState { projectId: string; plan: ProjectPlan; planHistory: ProjectPlan[]; taskStatuses: Record<string, TaskStatus>; capacitySnapshot: Record<string, PeerCapacitySummary>; planVersion: number; lastPlannedAt: string; }
export interface PlanChange { taskId: string; oldStudentId: string; newStudentId: string; estimatedHours: number; reason: string; }
export interface ReplanResult { previousPlanVersion: number; proposedPlanVersion: number; triggeringEvent: ProjectEvent; changedAllocations: PlanChange[]; unchangedAllocations: TaskAllocation[]; warnings: string[]; status: 'no_change_needed' | 'proposed' | 'needs_team_decision'; proposedPlan?: ProjectPlan; }
export interface TeamFeasibilitySummary { totalEstimatedProjectHours: number; totalSafeTeamHours: number; capacityMargin: number; status: 'feasible' | 'tight' | 'insufficient'; }

const round = (value: number): number => Math.round(value * 10) / 10;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function calculateTeamFeasibility(project: GroupProject, capacities: Record<string, PeerCapacitySummary | undefined>): TeamFeasibilitySummary {
  const totalEstimatedProjectHours = round(project.tasks.reduce((sum, task) => sum + task.estimatedHours, 0));
  const totalSafeTeamHours = round(Object.values(capacities).reduce((sum, capacity) => sum + (capacity?.availableProjectHours ?? 0), 0));
  const capacityMargin = round(totalSafeTeamHours - totalEstimatedProjectHours);
  return { totalEstimatedProjectHours, totalSafeTeamHours, capacityMargin, status: capacityMargin < 0 ? 'insufficient' : capacityMargin <= 4 ? 'tight' : 'feasible' };
}

export function validateCapacityChangeNotice(value: unknown): value is CapacityChangeNotice {
  if (!isRecord(value)) return false;
  const allowed = new Set(['studentId', 'previousCapacity', 'newCapacity', 'capacityLevel', 'highLevelConstraint']);
  return Object.keys(value).every((key) => allowed.has(key)) && typeof value.studentId === 'string' && typeof value.previousCapacity === 'number' && value.previousCapacity >= 0 && typeof value.newCapacity === 'number' && value.newCapacity >= 0 && ['low', 'medium', 'high'].includes(String(value.capacityLevel)) && value.highLevelConstraint === 'academic workload increased';
}

export function validateProjectEvent(value: unknown): value is ProjectEvent {
  if (!isRecord(value)) return false;
  const allowed = new Set(['id', 'type', 'timestamp', 'studentId', 'taskId', 'previousValue', 'newValue', 'source']);
  const types: ProjectEventType[] = ['ACADEMIC_LOAD_CHANGED', 'STUDENT_AVAILABILITY_CHANGED', 'STUDENT_UNAVAILABLE', 'TASK_ESTIMATE_CHANGED', 'TASK_BLOCKED', 'TASK_COMPLETED', 'PROJECT_DEADLINE_CHANGED', 'NEW_PROJECT_TASK'];
  return Object.keys(value).every((key) => allowed.has(key)) && typeof value.id === 'string' && types.includes(value.type as ProjectEventType) && typeof value.timestamp === 'string' && !Number.isNaN(new Date(value.timestamp).getTime()) && typeof value.source === 'string';
}

function unfinishedHoursForStudent(state: ProjectRuntimeState, studentId: string): number {
  return state.plan.allocations.filter((allocation) => allocation.studentId === studentId && state.taskStatuses[allocation.taskId] !== 'done').reduce((sum, allocation) => sum + allocation.estimatedHours, 0);
}

export function shouldReplan(event: ProjectEvent, state: ProjectRuntimeState): boolean {
  if (event.type === 'TASK_COMPLETED') return false;
  if (event.type === 'NEW_PROJECT_TASK') return true;
  if (event.type === 'PROJECT_DEADLINE_CHANGED') return typeof event.previousValue === 'string' && typeof event.newValue === 'string' && new Date(event.newValue) < new Date(event.previousValue);
  if (event.type === 'TASK_BLOCKED') return event.taskId !== undefined && state.taskStatuses[event.taskId] !== 'done';
  if (event.type === 'TASK_ESTIMATE_CHANGED') return typeof event.previousValue === 'number' && typeof event.newValue === 'number' && event.newValue > event.previousValue;
  if (!event.studentId) return false;
  if (event.type === 'STUDENT_UNAVAILABLE') return unfinishedHoursForStudent(state, event.studentId) > 0;
  if (event.type === 'ACADEMIC_LOAD_CHANGED' || event.type === 'STUDENT_AVAILABILITY_CHANGED') return validateCapacityChangeNotice(event.newValue) && unfinishedHoursForStudent(state, event.studentId) > event.newValue.newCapacity;
  return false;
}

export function identifyAffectedTasks(event: ProjectEvent, state: ProjectRuntimeState): string[] {
  const unfinished = (allocation: TaskAllocation): boolean => state.taskStatuses[allocation.taskId] !== 'done';
  if ((event.type === 'ACADEMIC_LOAD_CHANGED' || event.type === 'STUDENT_AVAILABILITY_CHANGED' || event.type === 'STUDENT_UNAVAILABLE') && event.studentId) return state.plan.allocations.filter((allocation) => allocation.studentId === event.studentId && unfinished(allocation)).map((allocation) => allocation.taskId);
  if (event.type === 'PROJECT_DEADLINE_CHANGED') return state.plan.allocations.filter(unfinished).map((allocation) => allocation.taskId);
  if (event.taskId && state.taskStatuses[event.taskId] !== 'done') return [event.taskId];
  return [];
}

export function createRuntimeState(project: GroupProject, plan: ProjectPlan, capacities: Record<string, PeerCapacitySummary>): ProjectRuntimeState {
  return { projectId: project.id, plan, planHistory: [plan], taskStatuses: Object.fromEntries(project.tasks.map((task) => [task.id, 'todo' as const])), capacitySnapshot: capacities, planVersion: plan.version, lastPlannedAt: plan.createdAt };
}

/** Completed work is immovable; in-progress work carries a large disruption penalty. */
export function calculateReassignmentPenalty(status: TaskStatus, ownerSkillFit: number): number {
  if (status === 'done') return Number.POSITIVE_INFINITY;
  const statusPenalty = status === 'in_progress' ? 100 : status === 'blocked' ? 5 : 10;
  return statusPenalty + Math.max(0, Math.min(1, ownerSkillFit)) * 50;
}
