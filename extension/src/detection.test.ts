import { beforeEach, describe, expect, it } from 'vitest';
import blackboardFixture from './adapters/fixtures/blackboard.html?raw';
import brightspaceFixture from './adapters/fixtures/brightspace.html?raw';
import portalFixture from './adapters/fixtures/university-portal.html?raw';
import { extractAcademicState } from './detection';

const urls = {
  brightspace: 'http://127.0.0.1:5173/brightspace',
  blackboard: 'http://127.0.0.1:5173/blackboard',
  portal: 'http://127.0.0.1:5173/portal'
} as const;

function load(html: string): void {
  document.body.innerHTML = html;
}

describe('platform adapters', () => {
  beforeEach(() => load(''));

  it('normalizes a Brightspace assignment', () => {
    load(brightspaceFixture);
    const state = extractAcademicState(document, urls.brightspace);
    expect(state.sourcePlatform).toBe('brightspace');
    expect(state.courses).toHaveLength(1);
    expect(state.assignments).toHaveLength(1);
    expect(state.assignments[0]).toMatchObject({
      courseCode: 'CSE 331', courseTitle: 'Algorithms and Data Structures', title: 'Assignment 2',
      description: 'Graph analysis', dueAt: '2026-09-08T23:59:00', pointsPossible: 100, status: 'published'
    });
    expect(state.assignments[0]?.courseId).toBe(state.courses[0]?.id);
    expect(state.exams[0]).toMatchObject({ title: 'Quiz 3', startsAt: '2026-09-10' });
  });

  it('normalizes Blackboard homework as an assignment', () => {
    load(blackboardFixture);
    const state = extractAcademicState(document, urls.blackboard);
    expect(state.sourcePlatform).toBe('blackboard');
    expect(state.assignments[0]).toMatchObject({
      courseCode: 'MTH 309', courseTitle: 'Linear Algebra', title: 'Homework 4',
      description: 'Vector spaces', dueAt: '2026-09-09', pointsPossible: 25
    });
    expect(state.exams[0]).toMatchObject({ title: 'Midterm', startsAt: '2026-09-18' });
    expect(state.announcements[0]?.description).toBe('Review problems are available.');
  });

  it('normalizes university schedule rows as class meetings', () => {
    load(portalFixture);
    const state = extractAcademicState(document, urls.portal);
    expect(state.sourcePlatform).toBe('university-portal');
    expect(state.courses).toHaveLength(2);
    expect(state.classMeetings[0]).toMatchObject({
      courseCode: 'CSE 331', meetingPattern: 'Mon/Wed', startsAt: '10:00:00', endsAt: '11:20:00',
      location: 'Engineering 104', instructor: 'Dr. Maya Chen', term: 'Fall 2026', status: 'scheduled'
    });
  });

  it('keeps a missing due date undefined', () => {
    load(`<section data-demo-platform="brightspace"><div data-course-code="CSE 331">CSE 331</div><article data-academic-item="assignment"><h3>Undated work</h3></article></section>`);
    const state = extractAcademicState(document, urls.brightspace);
    expect(state.assignments).toHaveLength(1);
    expect(state.assignments[0]?.dueAt).toBeUndefined();
  });

  it('does not invent times from a malformed meeting value', () => {
    load(`<section data-system="student-information-system"><table><tbody><tr data-enrollment-row><td><span class="subject">CSE</span> <span class="catalog">331</span></td><td>Mon/Wed 25:99–broken</td><td class="room">Lab</td><td>Dr. Test</td></tr></tbody></table></section>`);
    const meeting = extractAcademicState(document, urls.portal).classMeetings[0];
    expect(meeting?.startsAt).toBeUndefined();
    expect(meeting?.endsAt).toBeUndefined();
  });

  it('skips items whose course is empty', () => {
    load(`<section data-demo-platform="brightspace"><article data-academic-item="assignment"><h3>Orphan work</h3></article></section>`);
    const state = extractAcademicState(document, urls.brightspace);
    expect(state.courses).toEqual([]);
    expect(state.assignments).toEqual([]);
  });

  it('deduplicates the same assignment with a stable normalized id', () => {
    load(`<section data-demo-platform="brightspace"><div data-course-code="CSE 331">CSE 331</div><article data-academic-item="assignment"><h3>Assignment 2</h3></article><article data-academic-item="assignment"><h3>Assignment 2</h3></article></section>`);
    const first = extractAcademicState(document, urls.brightspace);
    const second = extractAcademicState(document, urls.brightspace);
    expect(first.assignments).toHaveLength(1);
    expect(first.assignments[0]?.id).toBe(second.assignments[0]?.id);
  });

  it('returns an empty canonical state for an unknown site', () => {
    load('<main>Not an academic system</main>');
    const state = extractAcademicState(document, 'https://example.test/page');
    expect(state.sourcePlatform).toBe('unknown');
    expect(state.courses).toEqual([]);
    expect(state.assignments).toEqual([]);
  });

  it('extracts multiple courses independently', () => {
    load(`<section data-demo-platform="brightspace"><div data-course-code="CSE 331">CSE 331</div><h1 data-course-title>Algorithms</h1><article data-academic-item="assignment"><h3>A2</h3></article></section><section data-demo-platform="brightspace"><div data-course-code="BIO 210">BIO 210</div><h1 data-course-title>Ecology</h1><article data-academic-item="assignment"><h3>Field Notes</h3></article></section>`);
    const state = extractAcademicState(document, urls.brightspace);
    expect(state.courses.map((course) => course.courseCode)).toEqual(['CSE 331', 'BIO 210']);
    expect(state.assignments).toHaveLength(2);
    expect(new Set(state.assignments.map((item) => item.courseId)).size).toBe(2);
  });
});
