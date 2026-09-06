import { beforeEach, describe, expect, it } from 'vitest';
import { buildClickObservation, inspectCourseDiscovery, sanitizeElement } from './course-discovery-inspector';

const url = new URL('https://ublearns.buffalo.edu/d2l/home');
const noResources = { getEntriesByType: () => [] } as unknown as Performance;

describe('safe real-page course discovery inspector', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('reports a custom element with an accessible open shadow root', () => {
    document.body.innerHTML = '<section><h2>My Courses</h2><course-card id="card"></course-card></section>';
    const card = document.querySelector<HTMLElement>('#card');
    card?.attachShadow({ mode: 'open' }).append(document.createElement('button'));
    const report = inspectCourseDiscovery(document, url, noResources);
    expect(report.reportVersion).toBe(2);
    expect(report.customElements[0]).toMatchObject({ tag: 'course-card', shadowRootAccessible: true, shadowChildCount: 1 });
  });

  it('walks the accessible My Courses shadow tree and preserves host ancestry', () => {
    document.body.innerHTML = '<section><h2>My Courses</h2><d2l-my-courses-v2 id="courses"></d2l-my-courses-v2></section>';
    const host = document.querySelector<HTMLElement>('#courses');
    const shadow = host?.attachShadow({ mode: 'open' });
    if (!shadow) throw new Error('Fixture shadow root missing');
    shadow.innerHTML = '<course-grid><a href="/d2l/home/123456">CSE 300: Sanitized Course</a></course-grid>';
    const report = inspectCourseDiscovery(document, url, noResources);
    expect(report.courseLinkHrefs).toBe(1);
    expect(report.courseTextVisible).toBe(true);
    expect(report.likelyDiscoveryStrategy).toBe('DOM_LINK');
    expect(report.clickableCandidates[0]?.shadowHostPath).toEqual(['d2l-my-courses-v2']);
  });

  it('reports shadowRootAccessible false without claiming why', () => {
    document.body.innerHTML = '<section><h2>My Courses</h2><course-card></course-card></section>';
    expect(inspectCourseDiscovery(document, url, noResources).customElements[0]?.shadowRootAccessible).toBe(false);
  });

  it('reports same-origin and cross-origin iframe metadata only', () => {
    document.body.innerHTML = '<section><h2>My Courses</h2><iframe src="/d2l/lp/widgetproxy/courses"></iframe><iframe src="https://widgets.example.test/courses" sandbox="allow-scripts"></iframe></section>';
    const frames = inspectCourseDiscovery(document, url, noResources).iframes;
    expect(frames[0]).toMatchObject({ origin: url.origin, pathname: '/d2l/lp/widgetproxy/courses', sameOrigin: true, contentDocumentAccessible: true });
    expect(frames[1]).toMatchObject({ origin: 'https://widgets.example.test', pathname: '/courses', sandbox: 'allow-scripts', sameOrigin: false, contentDocumentAccessible: false });
  });

  it('reports role links and button-driven navigation candidates without clicking', () => {
    document.body.innerHTML = '<section><h2>My Courses</h2><div role="link" tabindex="0">Open item</div><button>Open another</button></section>';
    const candidates = inspectCourseDiscovery(document, url, noResources).clickableCandidates;
    expect(candidates.map((candidate) => candidate.clickability)).toEqual(expect.arrayContaining([expect.arrayContaining(['role-link', 'tabindex']), expect.arrayContaining(['button'])]));
  });

  it('detects a numeric org-unit indicator while redacting unrelated data values', () => {
    document.body.innerHTML = '<section><h2>My Courses</h2><div role="link" data-org-unit-id="123456" data-display-name="Private Course">Course item</div></section>';
    const candidate = inspectCourseDiscovery(document, url, noResources).clickableCandidates[0];
    expect(candidate).toMatchObject({ orgUnitLikeIdPresent: true, dataAttributes: { 'data-org-unit-id': '123456', 'data-display-name': '[redacted]' } });
  });

  it('records a click-driven location change and Brightspace org-unit ID', () => {
    const target = document.createElement('button');
    const chain = [sanitizeElement(target, url)];
    const observation = buildClickObservation(url, new URL('https://ublearns.buffalo.edu/d2l/home/123456'), chain);
    expect(observation).toMatchObject({ beforePath: '/d2l/home', afterPath: '/d2l/home/123456', pathChanged: true, orgUnitLikeId: '123456', status: 'navigation-observed' });
  });

  it('reports only matching same-origin performance resource paths', () => {
    document.body.innerHTML = '<section><h2>My Courses</h2><button>Open</button></section>';
    const performanceApi = { getEntriesByType: () => [
      { name: 'https://ublearns.buffalo.edu/d2l/api/lp/1.50/enrollments/myenrollments/?token=redacted' },
      { name: 'https://cdn.example.test/course.js' }, { name: 'https://ublearns.buffalo.edu/assets/site.css' }
    ] } as unknown as Performance;
    expect(inspectCourseDiscovery(document, url, performanceApi).performanceResources).toEqual(['https://ublearns.buffalo.edu/d2l/api/lp/1.50/enrollments/myenrollments/']);
  });

  it('reports no safe path when neither text nor navigation is exposed', () => {
    document.body.innerHTML = '<main><h1>Welcome</h1></main>';
    expect(inspectCourseDiscovery(document, url, noResources)).toMatchObject({ myCoursesContainerFound: false, courseTextVisible: false, navigationTargetExposed: false, likelyDiscoveryStrategy: 'NO_SAFE_DOM_PATH_FOUND' });
  });
});
