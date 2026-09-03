import { beforeEach, describe, expect, it } from 'vitest';
import fixture from './fixtures/real-brightspace.html?raw';
import { adapterRegistry } from './registry';

const ubUrl = new URL('https://ublearns.buffalo.edu/d2l/home');

function load(html: string): void {
  document.body.innerHTML = html;
}

describe('RealBrightspaceAdapter', () => {
  beforeEach(() => load(''));

  it('is selected from the real UB hostname and D2L path', () => {
    load(fixture);
    expect(adapterRegistry.detect(document, ubUrl)?.id).toBe('ub-brightspace');
  });

  it('normalizes two structural course cards and deduplicates repeated links', () => {
    load(fixture);
    const state = adapterRegistry.extract(document, ubUrl);
    expect(state.sourcePlatform).toBe('ub-brightspace');
    expect(state.courses).toHaveLength(2);
    expect(state.courses[0]).toMatchObject({
      sourcePlatform: 'ub-brightspace', sourceId: '41001', courseCode: 'PHY 207LEC A',
      courseTitle: 'General Physics III', term: 'Fall 2026', status: 'active',
      sourceUrl: 'https://ublearns.buffalo.edu/d2l/home/41001'
    });
    expect(state.courses[1]).toMatchObject({ courseCode: 'CHE 201LR B', courseTitle: 'Organic Chemistry' });
    expect(state.assignments).toEqual([]);
  });

  it('does not treat a non-course administrative route as a course', () => {
    load(fixture);
    const state = adapterRegistry.extract(document, ubUrl);
    expect(state.courses.some((course) => course.courseTitle === 'Fictional Security Training')).toBe(false);
  });

  it('returns an empty UB AcademicState plus safe diagnostics for an empty page', () => {
    load('<main></main>');
    const state = adapterRegistry.extract(document, ubUrl);
    expect(state.sourcePlatform).toBe('ub-brightspace');
    expect(state.courses).toEqual([]);
    expect(state.diagnostics).toMatchObject({
      adapterSelected: 'ub-brightspace', hostname: 'ublearns.buffalo.edu', pathname: '/d2l/home',
      candidateCourseLinks: 0, candidateHrefPatterns: [], potentialCourseCardContainers: 0
    });
  });

  it('does not crash or invent a title when a course link has no visible title', () => {
    load('<d2l-enrollment-card><a href="/d2l/home/42000"></a></d2l-enrollment-card>');
    const state = adapterRegistry.extract(document, ubUrl);
    expect(state.courses).toEqual([]);
    expect(state.diagnostics?.candidateCourseLinks).toBe(1);
  });

  it('extracts a dynamically inserted card when extraction runs again', () => {
    load('<main id="courses"></main>');
    expect(adapterRegistry.extract(document, ubUrl).courses).toHaveLength(0);
    document.querySelector('#courses')?.insertAdjacentHTML('beforeend',
      '<d2l-enrollment-card><a href="/d2l/home/43000"><h3>BIO 200LEC A: Evolution</h3></a></d2l-enrollment-card>'
    );
    const state = adapterRegistry.extract(document, ubUrl);
    expect(state.courses).toHaveLength(1);
    expect(state.courses[0]).toMatchObject({ sourceId: '43000', courseCode: 'BIO 200LEC A', courseTitle: 'Evolution' });
  });

  it('does not select the real adapter for another host or a non-D2L path', () => {
    expect(adapterRegistry.detect(document, new URL('https://example.edu/d2l/home'))?.id).not.toBe('ub-brightspace');
    expect(adapterRegistry.detect(document, new URL('https://ublearns.buffalo.edu/'))?.id).not.toBe('ub-brightspace');
  });
});
