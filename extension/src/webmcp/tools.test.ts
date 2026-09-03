import { describe, expect, it } from 'vitest';
import { emptyAcademicState, type AcademicState, type Course, type SourceReference } from '@academic/core';
import { executeAcademicTool } from './tools';

const observedAt = '2026-09-03T12:00:00.000Z';
const source: SourceReference = { sourcePlatform: 'ub-brightspace', sourceUrl: 'https://ublearns.buffalo.edu/d2l/file.pdf', sourceTitle: 'CSE 341 Syllabus', sourceType: 'syllabus', extractedFrom: 'document-text', lastObservedAt: observedAt };
function course(id: string, code: string): Course { return { id, courseCode: code, courseTitle: code + ' title', sourcePlatform: 'ub-brightspace', sourceUrl: 'https://ublearns.buffalo.edu/d2l/home/' + id, lastObservedAt: observedAt }; }
function fixture(): AcademicState {
  const state = emptyAcademicState('ub-brightspace', new URL('https://ublearns.buffalo.edu/d2l/home'), observedAt);
  state.courses = [course('1', 'CSE 341'), course('2', 'MTH 309')];
  state.assignments = [
    { id: 'a-late', courseId: '1', courseCode: 'CSE 341', title: 'Project', dueAt: '2026-09-20T12:00:00', sourcePlatform: 'ub-brightspace', sourceUrl: source.sourceUrl, lastObservedAt: observedAt, sourceReference: source },
    { id: 'a-early', courseId: '2', courseCode: 'MTH 309', title: 'Homework', dueAt: '2026-09-10T12:00:00', sourcePlatform: 'ub-brightspace', sourceUrl: source.sourceUrl, lastObservedAt: observedAt, sourceReference: source },
    { id: 'a-none', courseId: '1', courseCode: 'CSE 341', title: 'Undated task', sourcePlatform: 'ub-brightspace', sourceUrl: source.sourceUrl, lastObservedAt: observedAt }
  ];
  state.exams = [{ id: 'e1', courseId: '1', courseCode: 'CSE 341', title: 'Midterm', startsAt: '2026-09-15T18:00:00', sourcePlatform: 'ub-brightspace', sourceUrl: source.sourceUrl, lastObservedAt: observedAt, sourceReference: source }];
  state.announcements = [{ id: 'n1', courseId: '1', courseCode: 'CSE 341', title: 'Welcome', sourcePlatform: 'ub-brightspace', sourceUrl: 'https://ublearns.buffalo.edu/d2l/news', lastObservedAt: observedAt }];
  state.policies = [{ id: 'p1', courseId: '1', courseCode: 'CSE 341', title: 'Attendance policy', policyType: 'attendance', description: 'Three absences lower the final grade.', sourcePlatform: 'ub-brightspace', sourceUrl: source.sourceUrl, sourceTitle: source.sourceTitle, sourceType: 'syllabus', extractedFrom: 'document-text', lastObservedAt: observedAt, sourceReference: source }];
  state.officeHours = [{ id: 'o1', courseId: '1', courseCode: 'CSE 341', title: 'Office hours', scheduleText: 'Tuesday 2-4 PM', sourcePlatform: 'ub-brightspace', sourceUrl: source.sourceUrl, lastObservedAt: observedAt, sourceReference: source }];
  state.documents = [{ id: 'd1', courseId: '1', courseCode: 'CSE 341', title: 'CSE 341 Syllabus', documentType: 'syllabus', textExtractionStatus: 'complete', ...source }];
  state.conflicts = [{ id: 'c1', type: 'DUE_DATE_CONFLICT', entityTitle: 'Project', courseId: '1', courseCode: 'CSE 341', sources: [source], values: [{ value: '2026-09-20', source }, { value: '2026-09-21', source }], detectedAt: observedAt }];
  return state;
}
const run = (name: Parameters<typeof executeAcademicTool>[0], input: unknown = {}) => executeAcademicTool(name, input, { state: fixture(), scanStatus: 'complete' });

describe('academic WebMCP tool logic', () => {
  it('returns the academic overview without document text', () => {
    expect(run('academic_get_overview')).toEqual({ scanStatus: 'complete', courses: 2, assignments: 3, exams: 1, announcements: 1, policies: 1, documentsScanned: 1, conflicts: 1, lastUpdatedAt: observedAt });
  });
  it('returns all courses and filters case-insensitively', () => {
    expect(run('academic_get_courses')).toHaveLength(2);
    expect(run('academic_get_courses', { courseCode: 'cse 341' })).toMatchObject([{ courseCode: 'CSE 341' }]);
  });
  it('returns assignments and exams in chronological order with undated items last', () => {
    const result = run('academic_get_upcoming') as { assignments: Array<{ id: string }>; exams: unknown[] };
    expect(result.assignments.map((item) => item.id)).toEqual(['a-early', 'a-late', 'a-none']);
    expect(result.exams).toHaveLength(1);
  });
  it('filters upcoming items by course and inclusive date range', () => {
    const result = run('academic_get_upcoming', { courseCode: 'CSE 341', startDate: '2026-09-14', endDate: '2026-09-20' }) as { assignments: Array<{ id: string }>; exams: Array<{ id: string }> };
    expect(result.assignments.map((item) => item.id)).toEqual(['a-late']);
    expect(result.exams.map((item) => item.id)).toEqual(['e1']);
  });
  it('excludes undated assignments from a supplied range and rejects malformed dates', () => {
    const result = run('academic_get_upcoming', { startDate: '2026-09-01' }) as { assignments: Array<{ id: string }> };
    expect(result.assignments.map((item) => item.id)).not.toContain('a-none');
    expect(() => run('academic_get_upcoming', { startDate: 'next Tuesday' })).toThrow('ISO 8601');
  });
  it('returns only normalized announcements', () => expect(run('academic_get_announcements', { courseCode: 'CSE 341' })).toHaveLength(1));
  it('filters policies by course and type and always includes provenance', () => {
    const policies = run('academic_get_policies', { courseCode: 'cse 341', policyType: 'attendance' }) as Array<{ source: { title?: string; url: string } }>;
    expect(policies).toHaveLength(1);
    expect(policies[0]?.source).toMatchObject({ title: 'CSE 341 Syllabus', url: source.sourceUrl });
    expect(run('academic_get_policies', { policyType: 'office_hours' })).toHaveLength(1);
  });
  it('returns conflicts without choosing a source', () => expect(run('academic_get_conflicts', { courseCode: 'CSE 341' })).toMatchObject([{ id: 'c1', values: [{ value: '2026-09-20' }, { value: '2026-09-21' }] }]));
  it('returns sources for a valid entity and an empty result for an unknown entity', () => {
    expect(run('academic_get_sources', { entityId: 'a-late' })).toMatchObject({ entityId: 'a-late', sources: [{ title: 'CSE 341 Syllabus' }] });
    expect(run('academic_get_sources', { entityId: 'missing' })).toEqual({ entityId: 'missing', sources: [] });
  });
  it('rejects malformed input and unsupported properties', () => {
    expect(() => run('academic_get_courses', [])).toThrow('object');
    expect(() => run('academic_get_courses', { read_dom: true })).toThrow('unsupported property');
  });
});

