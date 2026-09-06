import type { AcademicState } from '@academic/core';
import type { ProjectTask, StudentProfile } from '@shadow-cohort/core';

export const DEMO_NOW = new Date('2026-09-06T12:00:00.000Z');

function emptyState(): AcademicState {
  return {
    sourcePlatform: 'unknown', sourceUrl: 'https://demo.invalid/normalized-state', lastObservedAt: DEMO_NOW.toISOString(),
    courses: [], assignments: [], exams: [], announcements: [], classMeetings: [], documents: [], policies: [], officeHours: [], conflicts: []
  };
}

export const studentAProfile: StudentProfile = {
  id: 'student-a', displayName: 'Student A', weeklyAvailabilityHours: 12,
  skills: [
    { name: 'Python', proficiency: 'advanced' },
    { name: 'FastAPI', proficiency: 'advanced' },
    { name: 'Databases', proficiency: 'advanced' },
    { name: 'React', proficiency: 'intermediate' }
  ],
  preferences: { preferredTaskTypes: ['backend', 'database'] }
};

export const studentAAcademicState: AcademicState = {
  ...emptyState(),
  assignments: [
    { id: 'a-work-1', courseId: 'demo-course-a', title: 'Problem Set', dueAt: '2026-09-09T21:00:00.000Z', sourcePlatform: 'unknown', sourceUrl: 'https://demo.invalid/a/1', lastObservedAt: DEMO_NOW.toISOString() },
    { id: 'a-work-2', courseId: 'demo-course-b', title: 'Lab Report', dueAt: '2026-09-12T21:00:00.000Z', sourcePlatform: 'unknown', sourceUrl: 'https://demo.invalid/a/2', lastObservedAt: DEMO_NOW.toISOString() }
  ]
};

export const studentBProfile: StudentProfile = {
  id: 'student-b', displayName: 'Student B', weeklyAvailabilityHours: 16,
  skills: [
    { name: 'React', proficiency: 'expert' },
    { name: 'TypeScript', proficiency: 'advanced' },
    { name: 'UI', proficiency: 'advanced' }
  ],
  preferences: { preferredTaskTypes: ['frontend', 'UI'] }
};

export const studentBAcademicState: AcademicState = emptyState();

export const studentCProfile: StudentProfile = {
  id: 'student-c', displayName: 'Student C', weeklyAvailabilityHours: 12,
  skills: [
    { name: 'Machine Learning', proficiency: 'expert' },
    { name: 'ML', proficiency: 'expert' },
    { name: 'Python', proficiency: 'advanced' },
    { name: 'Data Analysis', proficiency: 'advanced' }
  ],
  preferences: { preferredTaskTypes: ['ML', 'data'] }
};

export const studentCAcademicState: AcademicState = {
  ...emptyState(),
  assignments: [
    { id: 'c-work-1', courseId: 'demo-course-c', title: 'Analysis Assignment', dueAt: '2026-09-09T20:00:00.000Z', sourcePlatform: 'unknown', sourceUrl: 'https://demo.invalid/c/1', lastObservedAt: DEMO_NOW.toISOString() }
  ],
  exams: [
    { id: 'c-exam-1', courseId: 'demo-course-d', title: 'Midterm Exam', startsAt: '2026-09-08T14:00:00.000Z', sourcePlatform: 'unknown', sourceUrl: 'https://demo.invalid/c/exam', lastObservedAt: DEMO_NOW.toISOString() }
  ]
};

export const backendApiTask: ProjectTask = {
  id: 'backend-api', title: 'Backend API', description: 'Build REST endpoints for project data.',
  requiredSkills: ['Python', 'FastAPI'], estimatedHours: 8, priority: 'high', dependencies: []
};

export const reactUiTask: ProjectTask = {
  id: 'react-ui', title: 'React UI', description: 'Build the accessible frontend interface.',
  requiredSkills: ['React', 'TypeScript', 'UI'], estimatedHours: 8, priority: 'high', dependencies: []
};

export const mlTask: ProjectTask = {
  id: 'ml-pipeline', title: 'ML Pipeline', description: 'Build and evaluate the project inference pipeline.',
  requiredSkills: ['Machine Learning', 'Python', 'Data Analysis'], estimatedHours: 16, priority: 'high', dependencies: []
};
