import { describe, expect, it } from 'vitest';
import type { AcademicState } from '@academic/core';
import {
  calculateCapacityFit,
  calculatePreferenceFit,
  calculateSkillFit,
  calculateStudentCapacity,
  createPeerCapacitySummary,
  evaluateTaskBid,
  summarizeAcademicWorkload,
  validateStudentProfile,
  type ProjectTask,
  type StudentCapacity,
  type StudentProfile
} from './index';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const profile: StudentProfile = {
  id: 'student-test', displayName: 'Test Student', weeklyAvailabilityHours: 12,
  skills: [{ name: 'Python', proficiency: 'advanced' }, { name: 'React', proficiency: 'intermediate' }],
  preferences: { preferredTaskTypes: ['backend'], avoidTaskTypes: ['documentation'] }
};
const task: ProjectTask = {
  id: 'api', title: 'Backend API', description: 'Build an API.', requiredSkills: ['Python'], estimatedHours: 6, priority: 'high', dependencies: []
};

function state(assignments: Array<{ id: string; title: string; dueAt?: string }> = [], exams: Array<{ id: string; title: string; startsAt?: string }> = []): AcademicState {
  return {
    sourcePlatform: 'unknown', sourceUrl: 'https://fixture.invalid/state', lastObservedAt: NOW.toISOString(), courses: [], announcements: [], classMeetings: [], documents: [], policies: [], officeHours: [], conflicts: [],
    assignments: assignments.map((item) => ({ ...item, courseId: 'private-course', sourcePlatform: 'unknown', sourceUrl: `https://fixture.invalid/${item.id}`, lastObservedAt: NOW.toISOString() })),
    exams: exams.map((item) => ({ ...item, courseId: 'private-course', sourcePlatform: 'unknown', sourceUrl: `https://fixture.invalid/${item.id}`, lastObservedAt: NOW.toISOString() }))
  };
}

describe('StudentProfile validation', () => {
  it('accepts an explicit valid profile', () => expect(validateStudentProfile(profile).success).toBe(true));
  it('rejects malformed skills and availability', () => {
    const result = validateStudentProfile({ id: '', displayName: '', weeklyAvailabilityHours: -1, skills: [{ name: '', proficiency: 'master' }] });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('academic workload', () => {
  it('reports low load with no deadlines', () => expect(summarizeAcademicWorkload(state(), NOW).estimatedLoad).toBe('low'));
  it('counts assignments within seven days', () => {
    const result = summarizeAcademicWorkload(state([{ id: 'a', title: 'Homework', dueAt: '2026-09-09T12:00:00.000Z' }]), NOW);
    expect(result.upcomingAssignments).toBe(1);
    expect(result.datedItemsNext7Days).toHaveLength(1);
  });
  it('scores an exam within seven days', () => {
    const result = summarizeAcademicWorkload(state([], [{ id: 'e', title: 'Midterm', startsAt: '2026-09-08T12:00:00.000Z' }]), NOW);
    expect(result.upcomingExams).toBe(1);
    expect(result.majorDeadlinesNext7Days).toBe(1);
    expect(result.estimatedLoad).toBe('medium');
  });
  it('adds pressure for multiple same-day deadlines', () => {
    const assignments = ['a', 'b', 'c'].map((id) => ({ id, title: 'Homework', dueAt: '2026-09-09T12:00:00.000Z' }));
    expect(summarizeAcademicWorkload(state(assignments), NOW).estimatedLoad).toBe('high');
  });
  it('ignores undated and malformed work for date pressure', () => {
    const result = summarizeAcademicWorkload(state([{ id: 'a', title: 'Undated' }, { id: 'b', title: 'Bad', dueAt: 'not-a-date' }]), NOW);
    expect(result).toMatchObject({ upcomingAssignments: 0, estimatedLoad: 'low' });
  });
});

describe('capacity', () => {
  it('preserves high capacity under low academic pressure', () => {
    expect(calculateStudentCapacity(profile, summarizeAcademicWorkload(state(), NOW))).toMatchObject({ availableProjectHours: 9.6, capacity: 'medium', academicPressure: 'low' });
  });
  it('reduces capacity under high pressure', () => {
    const workload = summarizeAcademicWorkload(state([{ id: 'a', title: 'Homework', dueAt: '2026-09-09T12:00:00.000Z' }], [{ id: 'e', title: 'Exam', startsAt: '2026-09-08T12:00:00.000Z' }]), NOW);
    expect(calculateStudentCapacity(profile, workload)).toMatchObject({ availableProjectHours: 4.2, capacity: 'low', academicPressure: 'high' });
  });
  it('respects explicitly constrained availability', () => {
    const constrained = { ...profile, weeklyAvailabilityHours: 2 };
    expect(calculateStudentCapacity(constrained, summarizeAcademicWorkload(state(), NOW)).availableProjectHours).toBe(1.6);
  });
});

describe('task fit and bid', () => {
  it('matches exact skills case-insensitively', () => expect(calculateSkillFit(profile, { ...task, requiredSkills: ['python'] })).toBe(0.85));
  it('scores a partial skill set', () => expect(calculateSkillFit(profile, { ...task, requiredSkills: ['Python', 'FastAPI'] })).toBe(0.43));
  it('scores a missing skill as zero', () => expect(calculateSkillFit(profile, { ...task, requiredSkills: ['Rust'] })).toBe(0));
  it('returns a willing bid for strong skills and good capacity', () => {
    const capacity = calculateStudentCapacity(profile, summarizeAcademicWorkload(state(), NOW));
    expect(evaluateTaskBid(profile, capacity, task)).toMatchObject({ willing: true, skillFit: 0.85 });
  });
  it('distinguishes strong skills from low capacity', () => {
    const capacity: StudentCapacity = { availableProjectHours: 2, capacity: 'low', academicPressure: 'critical', reasons: [] };
    const bid = evaluateTaskBid(profile, capacity, { ...task, estimatedHours: 16 });
    expect(bid.skillFit).toBe(0.85);
    expect(bid.capacityFit).toBeLessThan(0.2);
    expect(bid.willing).toBe(false);
  });
  it('distinguishes weak skills from high capacity', () => {
    const capacity: StudentCapacity = { availableProjectHours: 20, capacity: 'high', academicPressure: 'low', reasons: [] };
    expect(evaluateTaskBid(profile, capacity, { ...task, requiredSkills: ['Rust'] })).toMatchObject({ skillFit: 0, capacityFit: 1, willing: false });
  });
  it('applies explicit preference effects', () => {
    expect(calculatePreferenceFit(profile, task)).toBe(1);
    expect(calculatePreferenceFit(profile, { ...task, title: 'Documentation' })).toBe(0.2);
  });
  it('uses available hours in capacity fit', () => {
    const capacity: StudentCapacity = { availableProjectHours: 3, capacity: 'low', academicPressure: 'high', reasons: [] };
    expect(calculateCapacityFit(capacity, { ...task, estimatedHours: 12 })).toBe(0.15);
  });
});

describe('privacy boundary', () => {
  it('excludes raw academic fields from PeerCapacitySummary', () => {
    const academic = state([{ id: 'secret', title: 'Private Assignment Name', dueAt: '2026-09-09T12:00:00.000Z' }]);
    const capacity = calculateStudentCapacity(profile, summarizeAcademicWorkload(academic, NOW));
    const serialized = JSON.stringify(createPeerCapacitySummary(profile, capacity));
    expect(serialized).not.toContain('Private Assignment Name');
    expect(serialized).not.toContain('private-course');
    expect(serialized).not.toContain('fixture.invalid');
    expect(Object.keys(createPeerCapacitySummary(profile, capacity))).toEqual(['studentId', 'capacity', 'availableProjectHours', 'strongSkills', 'constraints']);
  });
});
