import type { PeerCapacitySummary, ProjectTask, TaskBid } from './schema';

export interface GroupProject {
  id: string;
  title: string;
  description: string;
  deadline: string;
  tasks: ProjectTask[];
}

export interface PeerTaskBidResponse {
  studentId: string;
  taskId: string;
  skillFit: number;
  capacityFit: number;
  preferenceFit: number;
  overallFit: number;
  willing: boolean;
  estimatedAvailableHours: number;
  explanation: string;
}

export interface PeerDescriptor {
  studentId: string;
  displayName: string;
  endpoint: string;
}

export interface TaskAllocation {
  taskId: string;
  studentId: string;
  estimatedHours: number;
  allocationScore: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

export interface UnallocatedTask {
  taskId: string;
  estimatedHours: number;
  reason: string;
}

export interface FairnessEntry {
  allocatedHours: number;
  availableHours: number;
  utilization: number;
}

export interface ProjectPlan {
  id: string;
  projectId: string;
  version: number;
  status: 'proposed' | 'approved' | 'changes_requested';
  allocations: TaskAllocation[];
  unallocatedTasks: UnallocatedTask[];
  warnings: string[];
  fairnessSummary: Record<string, FairnessEntry>;
  createdAt: string;
  feedback?: string;
}

export interface PeerBidRecord {
  peer: PeerDescriptor;
  bid: PeerTaskBidResponse;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isNonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validateGroupProject(value: unknown): string[] {
  if (!isRecord(value)) return ['GroupProject must be an object.'];
  const errors: string[] = [];
  for (const field of ['id', 'title', 'description', 'deadline'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') errors.push(`${field} is required.`);
  }
  if (typeof value.deadline === 'string' && Number.isNaN(new Date(value.deadline).getTime())) errors.push('deadline must be ISO 8601.');
  if (!Array.isArray(value.tasks) || value.tasks.length === 0) errors.push('tasks must contain at least one task.');
  else {
    const ids = new Set<string>();
    value.tasks.forEach((task, index) => {
      if (!isRecord(task) || typeof task.id !== 'string' || task.id.trim() === '') errors.push(`tasks[${index}].id is required.`);
      else if (ids.has(task.id)) errors.push(`tasks[${index}].id is duplicated.`);
      else ids.add(task.id);
      if (!isRecord(task) || !isNonNegative(task.estimatedHours)) errors.push(`tasks[${index}].estimatedHours is invalid.`);
      if (!isRecord(task) || !Array.isArray(task.requiredSkills) || task.requiredSkills.some((skill) => typeof skill !== 'string')) errors.push(`tasks[${index}].requiredSkills is invalid.`);
    });
  }
  return errors;
}

export function validatePeerTaskBidResponse(value: unknown): value is PeerTaskBidResponse {
  if (!isRecord(value)) return false;
  const allowed = new Set(['studentId', 'taskId', 'skillFit', 'capacityFit', 'preferenceFit', 'overallFit', 'willing', 'estimatedAvailableHours', 'explanation']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  return typeof value.studentId === 'string' && value.studentId.length > 0
    && typeof value.taskId === 'string' && value.taskId.length > 0
    && isScore(value.skillFit) && isScore(value.capacityFit) && isScore(value.preferenceFit) && isScore(value.overallFit)
    && typeof value.willing === 'boolean' && isNonNegative(value.estimatedAvailableHours)
    && typeof value.explanation === 'string';
}

/** Whitelists outbound fields so a TaskBid can never carry attached academic data. */
export function toPeerTaskBidResponse(bid: TaskBid): PeerTaskBidResponse {
  const response: PeerTaskBidResponse = {
    studentId: bid.studentId,
    taskId: bid.taskId,
    skillFit: bid.skillFit,
    capacityFit: bid.capacityFit,
    preferenceFit: bid.preferenceFit,
    overallFit: bid.overallFit,
    willing: bid.willing,
    estimatedAvailableHours: bid.estimatedAvailableHours,
    explanation: bid.explanation
  };
  if (!validatePeerTaskBidResponse(response)) throw new Error('Refusing to send an invalid peer task bid.');
  return response;
}

export function validatePeerCapacitySummary(value: unknown): value is PeerCapacitySummary {
  if (!isRecord(value)) return false;
  const allowed = new Set(['studentId', 'capacity', 'availableProjectHours', 'strongSkills', 'constraints']);
  return Object.keys(value).every((key) => allowed.has(key))
    && typeof value.studentId === 'string'
    && ['low', 'medium', 'high'].includes(String(value.capacity))
    && isNonNegative(value.availableProjectHours)
    && Array.isArray(value.strongSkills) && value.strongSkills.every((item) => typeof item === 'string')
    && Array.isArray(value.constraints) && value.constraints.every((item) => typeof item === 'string');
}

export function validateProjectPlan(value: unknown): string[] {
  if (!isRecord(value)) return ['ProjectPlan must be an object.'];
  const errors: string[] = [];
  if (typeof value.id !== 'string' || value.id === '') errors.push('id is required.');
  if (typeof value.projectId !== 'string' || value.projectId === '') errors.push('projectId is required.');
  if (!Number.isInteger(value.version) || Number(value.version) < 1) errors.push('version must be a positive integer.');
  if (!['proposed', 'approved', 'changes_requested'].includes(String(value.status))) errors.push('status is invalid.');
  if (!Array.isArray(value.allocations)) errors.push('allocations must be an array.');
  if (!Array.isArray(value.unallocatedTasks)) errors.push('unallocatedTasks must be an array.');
  if (!Array.isArray(value.warnings)) errors.push('warnings must be an array.');
  if (!isRecord(value.fairnessSummary)) errors.push('fairnessSummary must be an object.');
  if (typeof value.createdAt !== 'string' || Number.isNaN(new Date(value.createdAt).getTime())) errors.push('createdAt must be ISO 8601.');
  return errors;
}

export function approvePlan(plan: ProjectPlan): ProjectPlan {
  return { ...plan, status: 'approved', version: plan.version + 1 };
}

export function requestChanges(plan: ProjectPlan, feedback?: string): ProjectPlan {
  return { ...plan, status: 'changes_requested', version: plan.version + 1, ...(feedback ? { feedback } : {}) };
}

export const requestPlanChanges = requestChanges;
