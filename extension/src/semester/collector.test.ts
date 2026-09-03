import { describe, expect, it } from 'vitest';
import { emptyAcademicState, stableId, toDiscoveredCourses, type AcademicState, type Course } from '@academic/core';
import { SemesterCollector, mergeAcademicStates, type PageCollector } from './collector';

const homeUrl = new URL('https://ublearns.buffalo.edu/d2l/home');

function course(sourceId: string, code: string): Course {
  return {
    id: stableId('ub-brightspace', 'course', sourceId), sourceId, sourcePlatform: 'ub-brightspace',
    sourceUrl: `https://ublearns.buffalo.edu/d2l/home/${sourceId}`, lastObservedAt: '2026-09-02T12:00:00.000Z',
    courseCode: code, courseTitle: `${code} title`, status: 'active'
  };
}

function homeState(courses: Course[]): AcademicState {
  return { ...emptyAcademicState('ub-brightspace', homeUrl, '2026-09-02T12:00:00.000Z'), courses };
}

describe('semester course discovery and collection', () => {
  it('discovers multiple unique authorized courses and ignores non-course URLs', () => {
    const first = course('1', 'BIO 200');
    const second = course('2', 'CHE 201');
    const admin = { ...course('3', 'ADMIN'), sourceUrl: 'https://ublearns.buffalo.edu/d2l/le/content/3/Home' };
    expect(toDiscoveredCourses([first, first, second, admin]).map((item) => item.courseCode)).toEqual(['BIO 200', 'CHE 201']);
  });

  it('scans strictly sequentially and merges multiple courses', async () => {
    const courses = [course('1', 'BIO 200'), course('2', 'CHE 201')];
    let active = 0;
    let maximumActive = 0;
    const pages: PageCollector = { collect: async (url) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      const found = courses.find((item) => item.sourceUrl === url);
      return { state: homeState(found ? [found] : []), targets: [] };
    } };
    const result = await new SemesterCollector(pages).scan(homeState(courses));
    expect(maximumActive).toBe(1);
    expect(result.status).toBe('complete');
    expect(result.courses.map((item) => item.status)).toEqual(['complete', 'complete']);
    expect(result.academicState.courses).toHaveLength(2);
  });

  it('isolates a failed course and returns a partial semester result', async () => {
    const courses = [course('1', 'BIO 200'), course('2', 'CHE 201')];
    const pages: PageCollector = { collect: async (url) => {
      if (url.endsWith('/1')) throw new Error('fixture failure');
      return { state: homeState(courses.slice(1)), targets: [] };
    } };
    const result = await new SemesterCollector(pages).scan(homeState(courses));
    expect(result.status).toBe('partial');
    expect(result.courses.map((item) => item.status)).toEqual(['failed', 'complete']);
  });

  it('marks one course partial when a bounded child target fails', async () => {
    const selected = course('1', 'BIO 200');
    const pages: PageCollector = { collect: async (url) => {
      if (url.includes('dropbox')) throw new Error('fixture target failure');
      return { state: homeState([selected]), targets: ['https://ublearns.buffalo.edu/d2l/lms/dropbox/user/folders_list.d2l?ou=1'] };
    } };
    const result = await new SemesterCollector(pages).scan(homeState([selected]));
    expect(result.status).toBe('partial');
    expect(result.courses[0]?.status).toBe('partial');
  });

  it('returns complete with no work for an empty semester', async () => {
    const pages: PageCollector = { collect: async () => { throw new Error('should not run'); } };
    const result = await new SemesterCollector(pages).scan(homeState([]));
    expect(result.status).toBe('complete');
    expect(result.courses).toEqual([]);
  });

  it('deduplicates canonical entities while merging pages', () => {
    const selected = course('1', 'BIO 200');
    const state = homeState([selected]);
    expect(mergeAcademicStates(state, state).courses).toHaveLength(1);
  });
});
