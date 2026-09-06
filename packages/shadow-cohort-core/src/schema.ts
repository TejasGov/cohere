export type SkillProficiency = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type AcademicPressure = 'low' | 'medium' | 'high' | 'critical';
export type StudentCapacityLevel = 'low' | 'medium' | 'high';

export interface StudentSkill {
  name: string;
  proficiency: SkillProficiency;
}

export interface StudentProfile {
  id: string;
  displayName: string;
  /** Skills are student-declared. They are never inferred from academic records. */
  skills: StudentSkill[];
  weeklyAvailabilityHours: number;
  preferences?: {
    preferredTaskTypes?: string[];
    avoidTaskTypes?: string[];
  };
}

export interface AcademicWorkItem {
  id: string;
  kind: 'assignment' | 'quiz' | 'exam';
  title: string;
  occursAt: string;
  courseId: string;
  major: boolean;
}

export interface StudentWorkloadSummary {
  upcomingAssignments: number;
  upcomingExams: number;
  majorDeadlinesNext7Days: number;
  majorDeadlinesNext14Days: number;
  datedItemsNext7Days: AcademicWorkItem[];
  estimatedLoad: AcademicPressure;
  calculatedAt: string;
}

export interface StudentCapacity {
  availableProjectHours: number;
  capacity: StudentCapacityLevel;
  academicPressure: AcademicPressure;
  reasons: string[];
}

export interface ProjectTask {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  estimatedHours: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
}

export interface TaskBid {
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

/** The only capacity shape intended for future agent-to-agent disclosure. */
export interface PeerCapacitySummary {
  studentId: string;
  capacity: StudentCapacityLevel;
  availableProjectHours: number;
  strongSkills: string[];
  constraints: string[];
}

export interface ValidationResult<T> {
  success: boolean;
  value?: T;
  errors: string[];
}

const PROFICIENCIES = new Set<SkillProficiency>(['beginner', 'intermediate', 'advanced', 'expert']);

export function validateStudentProfile(value: unknown): ValidationResult<StudentProfile> {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) return { success: false, errors: ['Profile must be an object.'] };
  const profile = value as Partial<StudentProfile>;
  if (typeof profile.id !== 'string' || profile.id.trim() === '') errors.push('id is required.');
  if (typeof profile.displayName !== 'string' || profile.displayName.trim() === '') errors.push('displayName is required.');
  if (!Number.isFinite(profile.weeklyAvailabilityHours) || (profile.weeklyAvailabilityHours ?? -1) < 0) errors.push('weeklyAvailabilityHours must be a non-negative number.');
  if (!Array.isArray(profile.skills)) {
    errors.push('skills must be an array.');
  } else {
    profile.skills.forEach((skill, index) => {
      if (typeof skill?.name !== 'string' || skill.name.trim() === '') errors.push(`skills[${index}].name is required.`);
      if (!PROFICIENCIES.has(skill?.proficiency)) errors.push(`skills[${index}].proficiency is invalid.`);
    });
  }
  return errors.length === 0 ? { success: true, value: profile as StudentProfile, errors } : { success: false, errors };
}
