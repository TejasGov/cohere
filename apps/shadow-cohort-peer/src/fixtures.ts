import {
  DEMO_NOW,
  studentAAcademicState, studentAProfile,
  studentBAcademicState, studentBProfile,
  studentCAcademicState, studentCProfile
} from '@shadow-cohort/agent/profile';

export function peerFixture(id: string) {
  if (id === 'student-a') return { profile: studentAProfile, academicState: studentAAcademicState, now: DEMO_NOW };
  if (id === 'student-b') return { profile: studentBProfile, academicState: studentBAcademicState, now: DEMO_NOW };
  if (id === 'student-c') return { profile: studentCProfile, academicState: studentCAcademicState, now: DEMO_NOW };
  throw new Error(`Unknown sanitized peer fixture: ${id}`);
}
