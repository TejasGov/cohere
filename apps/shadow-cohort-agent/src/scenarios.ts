import type { AcademicState } from '@academic/core';
import type { StudentProfile } from '@shadow-cohort/core';
import {
  DEMO_NOW,
  studentAAcademicState, studentAProfile,
  studentBAcademicState, studentBProfile,
  studentCAcademicState, studentCProfile
} from './profile';

export interface StudentFixture { profile: StudentProfile; academicState: AcademicState; overloadAcademicState?: AcademicState; }
export interface TeamScenario { id: 'happy-path' | 'overloaded'; students: Record<string, StudentFixture>; }

function emptyAcademicState(studentId: string): AcademicState {
  return {
    sourcePlatform: 'unknown', sourceUrl: `https://fixtures.invalid/${studentId}/normalized`, lastObservedAt: DEMO_NOW.toISOString(),
    courses: [], assignments: [], exams: [], announcements: [], classMeetings: [], documents: [], policies: [], officeHours: [], conflicts: []
  };
}

const happyStudentA: StudentProfile = {
  id: 'student-a', displayName: 'Student A', weeklyAvailabilityHours: 15,
  skills: [
    { name: 'Python', proficiency: 'advanced' }, { name: 'FastAPI', proficiency: 'advanced' },
    { name: 'SQL', proficiency: 'advanced' }, { name: 'Database Design', proficiency: 'advanced' },
    { name: 'Testing', proficiency: 'advanced' }
  ],
  preferences: { preferredTaskTypes: ['backend', 'database', 'testing'] }
};

const happyStudentB: StudentProfile = {
  id: 'student-b', displayName: 'Student B', weeklyAvailabilityHours: 20,
  skills: [
    { name: 'React', proficiency: 'expert' }, { name: 'TypeScript', proficiency: 'advanced' },
    { name: 'UI', proficiency: 'advanced' }, { name: 'Testing', proficiency: 'advanced' },
    { name: 'Full Stack', proficiency: 'advanced' }, { name: 'Presentation', proficiency: 'advanced' },
    { name: 'Communication', proficiency: 'intermediate' }
  ],
  preferences: { preferredTaskTypes: ['frontend', 'UI', 'testing', 'presentation'] }
};

const happyStudentC: StudentProfile = {
  id: 'student-c', displayName: 'Student C', weeklyAvailabilityHours: 12,
  skills: [
    { name: 'ML', proficiency: 'expert' }, { name: 'Python', proficiency: 'advanced' },
    { name: 'Data Analysis', proficiency: 'advanced' }, { name: 'Presentation', proficiency: 'advanced' },
    { name: 'Communication', proficiency: 'intermediate' }
  ],
  preferences: { preferredTaskTypes: ['ML', 'data', 'presentation'] }
};

const studentCOverloadState: AcademicState = {
  ...emptyAcademicState('student-c-overload'),
  assignments: [{
    id: 'private-pressure-item', courseId: 'private-course', title: 'Private upcoming work', dueAt: '2026-09-10T20:00:00.000Z',
    sourcePlatform: 'unknown', sourceUrl: 'https://fixtures.invalid/private/item', lastObservedAt: DEMO_NOW.toISOString()
  }]
};

export const happyPathTeamScenario: TeamScenario = {
  id: 'happy-path',
  students: {
    'student-a': { profile: happyStudentA, academicState: emptyAcademicState('student-a') },
    'student-b': { profile: happyStudentB, academicState: emptyAcademicState('student-b') },
    'student-c': { profile: happyStudentC, academicState: emptyAcademicState('student-c'), overloadAcademicState: studentCOverloadState }
  }
};

export const overloadedTeamScenario: TeamScenario = {
  id: 'overloaded',
  students: {
    'student-a': { profile: studentAProfile, academicState: studentAAcademicState },
    'student-b': { profile: studentBProfile, academicState: studentBAcademicState },
    'student-c': { profile: studentCProfile, academicState: studentCAcademicState }
  }
};
