import type { ProjectTask, StudentCapacity, StudentProfile, TaskBid } from './schema';

const PROFICIENCY_SCORE = { beginner: 0.25, intermediate: 0.6, advanced: 0.85, expert: 1 } as const;
const CAPACITY_MULTIPLIER = { low: 0.6, medium: 0.85, high: 1 } as const;
const round = (value: number): number => Math.round(value * 100) / 100;
const normalize = (value: string): string => value.trim().toLocaleLowerCase();

export function calculateSkillFit(profile: StudentProfile, task: ProjectTask): number {
  if (task.requiredSkills.length === 0) return 1;
  const declared = new Map(profile.skills.map((skill) => [normalize(skill.name), PROFICIENCY_SCORE[skill.proficiency]]));
  return round(task.requiredSkills.reduce((total, skill) => total + (declared.get(normalize(skill)) ?? 0), 0) / task.requiredSkills.length);
}

export function calculateCapacityFit(capacity: StudentCapacity, task: ProjectTask): number {
  if (task.estimatedHours <= 0) return 1;
  return round(Math.min(1, capacity.availableProjectHours / task.estimatedHours) * CAPACITY_MULTIPLIER[capacity.capacity]);
}

export function calculatePreferenceFit(profile: StudentProfile, task: ProjectTask): number {
  const haystack = normalize(`${task.title} ${task.description} ${task.requiredSkills.join(' ')}`);
  if ((profile.preferences?.avoidTaskTypes ?? []).some((type) => haystack.includes(normalize(type)))) return 0.2;
  const preferred = profile.preferences?.preferredTaskTypes ?? [];
  if (preferred.length === 0) return 0.75;
  return preferred.some((type) => haystack.includes(normalize(type))) ? 1 : 0.6;
}

export function evaluateTaskBid(profile: StudentProfile, capacity: StudentCapacity, task: ProjectTask): TaskBid {
  const skillFit = calculateSkillFit(profile, task);
  const capacityFit = calculateCapacityFit(capacity, task);
  const preferenceFit = calculatePreferenceFit(profile, task);
  const overallFit = round(skillFit * 0.55 + capacityFit * 0.3 + preferenceFit * 0.15);
  const willing = skillFit >= 0.5 && capacityFit >= 0.45 && overallFit >= 0.55;
  const explanation = willing
    ? `Declared skills fit this task (${Math.round(skillFit * 100)}%) and current academic capacity can support it.`
    : skillFit < 0.5
      ? `The task is not a strong match for the student's explicitly declared skills (${Math.round(skillFit * 100)}%).`
      : 'Declared skills are a good match, but current academic capacity is too limited for this task.';
  return { studentId: profile.id, taskId: task.id, skillFit, capacityFit, preferenceFit, overallFit, willing, estimatedAvailableHours: capacity.availableProjectHours, explanation };
}
