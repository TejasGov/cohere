import { beforeEach, describe, expect, it } from 'vitest';
import { emptyAcademicState, stableId, type Course } from '@academic/core';
import homeHtml from './fixtures/course-home.html?raw';
import contentHtml from './fixtures/content-entry.html?raw';
import informationHtml from './fixtures/course-information-module.html?raw';
import projectHtml from './fixtures/project-module.html?raw';
import topicHtml from './fixtures/syllabus-topic.html?raw';
import { discoverTargetDocuments } from '../documents/classification';
import { SemesterCollector, type CollectedPage, type PageCollector } from './collector';
import { discoverAcademicNavigation } from './page-discovery';

const course: Course = {
  id: stableId('ub-brightspace', 'course', '34101'), sourceId: '34101', sourcePlatform: 'ub-brightspace',
  sourceUrl: 'https://ublearns.buffalo.edu/d2l/home/34101', lastObservedAt: '2026-09-05T12:00:00.000Z',
  courseCode: 'CSE 341', courseTitle: 'Computer Organization', status: 'active'
};
const entryUrl = 'https://ublearns.buffalo.edu/d2l/le/content/34101/Home';
const module101 = entryUrl + '?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-101';
const module103 = entryUrl + '?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-103';

function fixturePage(html: string, url: string): CollectedPage {
  document.body.innerHTML = html;
  const pageUrl = new URL(url);
  const navigationTargets = discoverAcademicNavigation(document, pageUrl);
  return {
    state: emptyAcademicState('ub-brightspace', pageUrl, course.lastObservedAt),
    targets: navigationTargets.map((target) => target.url), navigationTargets
  };
}

function fixtureCollector(brokenUrl?: string): { pages: PageCollector; calls: string[]; contexts: Array<Course | undefined> } {
  const calls: string[] = [];
  const contexts: Array<Course | undefined> = [];
  const pages: PageCollector = { collect: async (url, context) => {
    calls.push(url); contexts.push(context);
    if (url === brokenUrl) throw new Error('sanitized broken module');
    if (url === course.sourceUrl) return fixturePage(homeHtml, url);
    if (url === entryUrl) return fixturePage(contentHtml, url);
    if (url === module101) return fixturePage(informationHtml, url);
    if (url === module103) return fixturePage(projectHtml, url);
    return fixturePage(topicHtml, url);
  } };
  return { pages, calls, contexts };
}

describe('real Brightspace Content navigation fixtures', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('discovers the semantic Content entry on the course home', () => {
    const targets = fixturePage(homeHtml, course.sourceUrl).navigationTargets;
    expect(targets).toEqual([{ url: entryUrl, pageType: 'content-entry', label: 'Content' }]);
  });

  it('ignores lecture modules while preserving relevant module URLs', () => {
    const targets = fixturePage(contentHtml, entryUrl).navigationTargets;
    expect(targets?.map((target) => target.label)).toEqual(['Course Information', 'Projects and Assignments']);
    expect(targets?.map((target) => target.url)).toEqual([module101, module103]);
  });

  it('classifies a syllabus and policy nested in a module', () => {
    document.body.innerHTML = informationHtml;
    const documents = discoverTargetDocuments(document, new URL(module101), course);
    expect(documents.map((item) => item.documentType)).toEqual(['syllabus', 'course-policy']);
  });

  it('traverses entry, modules, and topics with course context preserved', async () => {
    const { pages, calls, contexts } = fixtureCollector();
    const home = emptyAcademicState('ub-brightspace', new URL('https://ublearns.buffalo.edu/d2l/home'), course.lastObservedAt);
    home.courses = [course];
    const result = await new SemesterCollector(pages).scan(home);
    const diagnostic = result.courses[0]?.documentDiagnostics;
    expect(calls).toHaveLength(7);
    expect(contexts.every((context) => context?.id === course.id)).toBe(true);
    expect(diagnostic).toMatchObject({ courseHomeVisited: true, contentEntryFound: true, contentEntryUrl: entryUrl, modulesVisited: 2, topicsVisited: 3 });
  });

  it('keeps scanning sibling modules after one module fails', async () => {
    const { pages, calls } = fixtureCollector(module101);
    const home = emptyAcademicState('ub-brightspace', new URL('https://ublearns.buffalo.edu/d2l/home'), course.lastObservedAt);
    home.courses = [course];
    const result = await new SemesterCollector(pages).scan(home);
    expect(calls).toContain(module103);
    expect(calls).toContain('https://ublearns.buffalo.edu/d2l/le/content/34101/viewContent/503/View');
    expect(result.courses[0]?.status).toBe('partial');
    expect(result.courses[0]?.navigationSteps?.some((step) => step.safeUrl === module101 && step.result === 'failed')).toBe(true);
  });

  it('enforces the per-course content page limit', async () => {
    const { pages, calls } = fixtureCollector();
    const home = emptyAcademicState('ub-brightspace', new URL('https://ublearns.buffalo.edu/d2l/home'), course.lastObservedAt);
    home.courses = [course];
    const result = await new SemesterCollector(pages, 2).scan(home);
    expect(calls).toHaveLength(3);
    expect(result.courses[0]?.documentDiagnostics?.contentPagesVisited).toBe(2);
    expect(result.courses[0]?.navigationSteps?.some((step) => step.result === 'ignored-limit')).toBe(true);
  });
});
