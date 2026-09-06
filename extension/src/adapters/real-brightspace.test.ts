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

  it('extracts a real-style href-bearing enrollment component without a light DOM anchor', () => {
    load('<d2l-my-courses-card-grid><d2l-enrollment-card href="/d2l/home/21099?ignored=1" text="CSE 341LR A: Computer Organization (21099 Fall 26)- Combined" subtext="2269_21099 • Fall 26"></d2l-enrollment-card></d2l-my-courses-card-grid>');
    const state = adapterRegistry.extract(document, ubUrl);
    expect(state.courses).toHaveLength(1);
    expect(state.courses[0]).toMatchObject({ sourceId: '21099', courseCode: 'CSE 341LR A', courseTitle: 'Computer Organization (21099 Fall 26)- Combined', sourceUrl: 'https://ublearns.buffalo.edu/d2l/home/21099' });
  });

  it('extracts a route stored in a stable non-href card attribute', () => {
    load('<d2l-enrollment-card data-url="/d2l/home/21102" primary-text="CSE 250LR A: Data Structures"></d2l-enrollment-card>');
    expect(adapterRegistry.extract(document, ubUrl).courses[0]).toMatchObject({ sourceId: '21102', courseCode: 'CSE 250LR A', courseTitle: 'Data Structures' });
  });

  it('discovers a course anchor inside an arbitrary nested open shadow root', () => {
    load('<div id="host"></div>');
    const host = document.querySelector<HTMLElement>('#host');
    const shadow = host?.attachShadow({ mode: 'open' });
    if (!shadow) throw new Error('Fixture shadow root missing');
    shadow.innerHTML = '<section><a href="/d2l/home/21100"><h3>STA 301REC R2: Intro to Probability</h3></a></section>';
    expect(adapterRegistry.extract(document, ubUrl).courses[0]).toMatchObject({ sourceId: '21100', courseCode: 'STA 301REC R2', courseTitle: 'Intro to Probability' });
  });

  it('discovers a course rendered in a same-origin homepage widget frame', () => {
    load('<iframe id="courses-widget"></iframe>');
    const frame = document.querySelector<HTMLIFrameElement>('#courses-widget');
    if (!frame?.contentDocument) throw new Error('Fixture frame document missing');
    frame.contentDocument.body.innerHTML = '<d2l-enrollment-card href="/d2l/home/21101" text="MTH 309LEC A: Linear Algebra"></d2l-enrollment-card>';
    expect(adapterRegistry.extract(document, ubUrl).courses[0]).toMatchObject({ sourceId: '21101', courseCode: 'MTH 309LEC A', courseTitle: 'Linear Algebra' });
  });

  it('does not select the real adapter for another host or a non-D2L path', () => {
    expect(adapterRegistry.detect(document, new URL('https://example.edu/d2l/home'))?.id).not.toBe('ub-brightspace');
    expect(adapterRegistry.detect(document, new URL('https://ublearns.buffalo.edu/'))?.id).not.toBe('ub-brightspace');
  });
});
