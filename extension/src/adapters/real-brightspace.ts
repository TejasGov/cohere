import {
  cleanText, deduplicateById, emptyAcademicState, stableId,
  type AcademicAdapter, type Announcement, type Assignment, type Course, type Exam, type ExtractionDiagnostics
} from '@academic/core';
import { parseAcademicDate, parsePoints } from './common';

function queryRoots(document: Document): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [document];
  for (let index = 0; index < roots.length && roots.length < 50; index += 1) {
    roots[index]?.querySelectorAll<HTMLElement>('*').forEach((host) => {
      if (roots.length < 50 && host.shadowRoot && !roots.includes(host.shadowRoot)) roots.push(host.shadowRoot);
      if (roots.length < 50 && host instanceof HTMLIFrameElement) {
        try {
          if (host.contentDocument && !roots.includes(host.contentDocument)) roots.push(host.contentDocument);
        } catch {
          // Cross-origin frames are outside the visible same-origin DOM scope.
        }
      }
    });
  }
  return roots;
}

function courseContainer(element: Element): Element | null {
  if (element.matches('d2l-enrollment-card, d2l-card, [data-org-unit-id], [data-testid*="course"], article, [role="listitem"], li')) return element;
  return element.closest('d2l-enrollment-card, d2l-card, [data-org-unit-id], [data-testid*="course"], article, [role="listitem"], li');
}

function visibleCourseTitle(element: Element, container: Element | null): string | undefined {
  const structured = cleanText(container?.querySelector('[data-course-title], [slot="header"], h1, h2, h3, h4')?.textContent);
  const attributes = ['text', 'primary-text', 'heading', 'label', 'title', 'aria-label', 'data-course-title', 'course-title', 'course-name'];
  for (const attribute of attributes) {
    const value = cleanText(element.getAttribute(attribute)) ?? cleanText(container?.getAttribute(attribute));
    if (value && !/^(open|view|enter)\s+(?:this\s+)?course$/i.test(value)) return structured ?? value;
  }
  return structured ?? cleanText(element.textContent) ?? cleanText(container?.textContent);
}

function courseHref(element: Element): string | undefined {
  const preferred = ['href', 'data-href', 'data-url', 'url', 'link-href'];
  for (const name of preferred) {
    const value = element.getAttribute(name);
    if (value && /\/d2l\/home\/\d+/i.test(value)) return value;
  }
  for (const attribute of Array.from(element.attributes)) {
    if (/\/d2l\/home\/\d+/i.test(attribute.value)) return attribute.value;
  }
  try {
    const component = element as HTMLElement & { href?: unknown; url?: unknown };
    for (const value of [component.href, component.url]) {
      if (typeof value === 'string' && /\/d2l\/home\/\d+/i.test(value)) return value;
    }
  } catch {
    // Custom-element properties are not guaranteed to cross isolated worlds.
  }
  return undefined;
}

function parseCourseTitle(value: string): { courseCode?: string; courseTitle: string } {
  const match = /^([A-Z]{2,5}\s+\d{2,4}[A-Z]*(?:\s+[A-Z0-9]+)?):\s*(.+)$/u.exec(value);
  if (!match) return { courseTitle: value };
  return { courseCode: cleanText(match[1]), courseTitle: cleanText(match[2]) ?? value };
}

function sanitizedUrl(rawHref: string, base: URL): URL | undefined {
  try {
    const parsed = new URL(rawHref, base);
    parsed.search = '';
    parsed.hash = '';
    return parsed;
  } catch {
    return undefined;
  }
}

function safeHrefPattern(href: string): string | undefined {
  try {
    return new URL(href).pathname.replace(/\/d2l\/home\/\d+.*$/, '/d2l/home/:orgUnitId');
  } catch {
    return undefined;
  }
}

function sourceIdFromNewsUrl(url: URL, container: Element | null): string | undefined {
  const explicit = cleanText(container?.getAttribute('data-announcement-id'));
  const pathIds = url.pathname.match(/\d+/g);
  return explicit ?? pathIds?.at(-1);
}

function assignmentId(anchorUrl: URL, container: Element | null): string | undefined {
  return cleanText(container?.getAttribute('data-assignment-id')) ?? cleanText(anchorUrl.searchParams.get('db'));
}

function visibleDate(element: Element | null): string | undefined {
  if (!element) return undefined;
  const raw = element.getAttribute('datetime') ?? element.getAttribute('data-due-date') ??
    element.getAttribute('data-starts-at') ?? element.getAttribute('data-ends-at') ??
    element.getAttribute('aria-label') ?? element.textContent;
  return parseAcademicDate(cleanText(raw)?.replace(/^due(?: date)?(?: on)?\s*:?\s*/i, 'Due '));
}

function visibleStatus(container: Element): Assignment['status'] {
  const raw = cleanText(
    container.getAttribute('data-status') ??
    container.querySelector('[data-assignment-status]')?.textContent
  )?.toLocaleLowerCase();
  if (raw === 'active' || raw === 'completed' || raw === 'cancelled') return raw;
  return undefined;
}

export class RealBrightspaceAdapter implements AcademicAdapter {
  readonly id = 'ub-brightspace' as const;

  canHandle(document: Document, url: URL): boolean {
    void document;
    return url.hostname === 'ublearns.buffalo.edu' && url.pathname.startsWith('/d2l/');
  }

  extract(document: Document, url: URL) {
    const observedAt = new Date().toISOString();
    const safePageUrl = new URL(url.origin + url.pathname);
    const state = emptyAcademicState(this.id, safePageUrl, observedAt);
    const roots = queryRoots(document);
    const courseAnchors = roots.flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('*')).filter((element) => courseHref(element) !== undefined));
    const courseCardContainers = new Set<Element>();
    const hrefPatterns = new Set<string>();
    const courses: Course[] = [];

    courseAnchors.forEach((anchor) => {
      const rawCourseHref = courseHref(anchor);
      if (!rawCourseHref) return;
      const courseUrl = sanitizedUrl(rawCourseHref, url);
      if (!courseUrl || courseUrl.hostname !== url.hostname) return;
      const orgUnitMatch = /^\/d2l\/home\/(\d+)\/?$/i.exec(courseUrl.pathname);
      if (!orgUnitMatch?.[1]) return;
      const container = courseContainer(anchor);
      if (container) courseCardContainers.add(container);
      const orgUnitType = cleanText(container?.getAttribute('data-org-unit-type'))?.toLocaleLowerCase();
      if (orgUnitType && !['course', 'course offering', 'offering'].includes(orgUnitType)) return;
      const pattern = safeHrefPattern(courseUrl.href);
      if (pattern) hrefPatterns.add(pattern);
      const visibleTitle = visibleCourseTitle(anchor, container);
      if (!visibleTitle) return;
      const { courseCode, courseTitle } = parseCourseTitle(visibleTitle);
      const sourceId = orgUnitMatch[1];
      const term = cleanText(anchor.dataset.term ?? anchor.getAttribute('subtext') ?? container?.getAttribute('data-term') ?? container?.getAttribute('subtext') ?? container?.querySelector('[data-term]')?.textContent);
      courses.push({
        id: stableId(this.id, 'course', sourceId), sourcePlatform: this.id, sourceUrl: courseUrl.href,
        sourceId, lastObservedAt: observedAt, courseCode, courseTitle, term, status: 'active'
      });
    });

    state.courses = deduplicateById(courses);
    const course = state.courses[0];
    const fallbackOrgUnitId = /^\d+$/.test(url.searchParams.get('ou') ?? '') ? url.searchParams.get('ou') ?? undefined : undefined;
    const contextualCourseId = course?.id ?? (fallbackOrgUnitId ? stableId(this.id, 'course', fallbackOrgUnitId) : undefined);

    const newsAnchors = roots.flatMap((root) => Array.from(
      root.querySelectorAll<HTMLAnchorElement>('a[href*="/d2l/le/news/"], a[href*="/d2l/lms/news/"]')
    ));
    const announcementContainers = new Set<Element>();
    const announcements: Announcement[] = [];
    let candidateAnnouncementTitles = 0;

    newsAnchors.forEach((anchor) => {
      const itemUrl = sanitizedUrl(anchor.getAttribute('href') ?? anchor.href, url);
      if (!itemUrl || itemUrl.hostname !== url.hostname) return;
      const container = anchor.closest('d2l-announcement, [data-announcement-id], article, [role="listitem"], li');
      if (!container) return;
      announcementContainers.add(container);
      const title = cleanText(anchor.textContent) ?? cleanText(container.querySelector('[data-announcement-title], h1, h2, h3, h4')?.textContent);
      if (!title || /^(?:announcements?|view all(?: announcements?)?)$/i.test(title)) return;
      candidateAnnouncementTitles += 1;
      const sourceId = sourceIdFromNewsUrl(itemUrl, container);
      const description = cleanText(
        container.querySelector('[data-announcement-description], [slot="content"], .d2l-htmlblock')?.textContent
      );
      announcements.push({
        id: stableId(this.id, 'announcement', contextualCourseId, sourceId, title),
        sourcePlatform: this.id, sourceUrl: itemUrl.href, sourceId, lastObservedAt: observedAt,
        courseId: contextualCourseId, courseCode: course?.courseCode, courseTitle: course?.courseTitle,
        title, description
      });
    });

    const assignmentAnchors = roots.flatMap((root) => Array.from(
      root.querySelectorAll<HTMLAnchorElement>('a[href*="/d2l/lms/dropbox/"]')
    ));
    const assignmentContainers = new Set<Element>();
    const assignments: Assignment[] = [];

    assignmentAnchors.forEach((anchor) => {
      let linkedUrl: URL;
      try {
        linkedUrl = new URL(anchor.getAttribute('href') ?? anchor.href, url);
      } catch {
        return;
      }
      if (linkedUrl.hostname !== url.hostname) return;
      const container = anchor.closest('[data-assignment-id], d2l-list-item, tr, article, [role="listitem"], li');
      const sourceId = assignmentId(linkedUrl, container);
      if (!container || !sourceId || !contextualCourseId) return;
      assignmentContainers.add(container);
      const title = cleanText(anchor.textContent) ?? cleanText(container.querySelector('[data-assignment-title], h1, h2, h3, h4')?.textContent);
      if (!title) return;
      const itemUrl = sanitizedUrl(linkedUrl.href, url);
      if (!itemUrl) return;
      itemUrl.searchParams.set('db', sourceId);
      const assignmentOrgUnitId = cleanText(linkedUrl.searchParams.get('ou')) ?? fallbackOrgUnitId;
      if (assignmentOrgUnitId && /^\d+$/.test(assignmentOrgUnitId)) itemUrl.searchParams.set('ou', assignmentOrgUnitId);
      const dueElement = container.querySelector('[data-due-date], time[datetime], time, [aria-label^="Due" i]');
      const pointsElement = container.querySelector('[data-points-possible]');
      const description = cleanText(container.querySelector('[data-assignment-description], .d2l-htmlblock')?.textContent);
      assignments.push({
        id: stableId(this.id, 'assignment', contextualCourseId, sourceId),
        sourcePlatform: this.id, sourceUrl: itemUrl.href, sourceId, lastObservedAt: observedAt,
        courseId: contextualCourseId, courseCode: course?.courseCode, courseTitle: course?.courseTitle,
        title, description, dueAt: visibleDate(dueElement),
        pointsPossible: parsePoints(pointsElement?.getAttribute('data-points-possible') ?? pointsElement?.textContent),
        status: visibleStatus(container)
      });
    });

    const examAnchors = roots.flatMap((root) => Array.from(
      root.querySelectorAll<HTMLAnchorElement>('a[href*="/d2l/lms/quizzing/"]')
    ));
    const examContainers = new Set<Element>();
    const exams: Exam[] = [];

    examAnchors.forEach((anchor) => {
      let linkedUrl: URL;
      try {
        linkedUrl = new URL(anchor.getAttribute('href') ?? anchor.href, url);
      } catch {
        return;
      }
      if (linkedUrl.hostname !== url.hostname) return;
      const container = anchor.closest('[data-exam-id], [data-quiz-id], d2l-list-item, tr, article, [role="listitem"], li');
      const sourceId = cleanText(container?.getAttribute('data-exam-id') ?? container?.getAttribute('data-quiz-id')) ??
        cleanText(linkedUrl.searchParams.get('qi'));
      if (!container || !sourceId || !contextualCourseId) return;
      examContainers.add(container);
      const title = cleanText(anchor.textContent) ?? cleanText(container.querySelector('[data-exam-title], [data-quiz-title], h1, h2, h3, h4')?.textContent);
      if (!title) return;
      const itemUrl = sanitizedUrl(linkedUrl.href, url);
      if (!itemUrl) return;
      itemUrl.searchParams.set('qi', sourceId);
      const examOrgUnitId = cleanText(linkedUrl.searchParams.get('ou')) ?? fallbackOrgUnitId;
      if (examOrgUnitId && /^\d+$/.test(examOrgUnitId)) itemUrl.searchParams.set('ou', examOrgUnitId);
      const pointsElement = container.querySelector('[data-points-possible]');
      exams.push({
        id: stableId(this.id, 'exam', contextualCourseId, sourceId),
        sourcePlatform: this.id, sourceUrl: itemUrl.href, sourceId, lastObservedAt: observedAt,
        courseId: contextualCourseId, courseCode: course?.courseCode, courseTitle: course?.courseTitle,
        title,
        startsAt: visibleDate(container.querySelector('[data-starts-at]')),
        endsAt: visibleDate(container.querySelector('[data-ends-at]')),
        dueAt: visibleDate(container.querySelector('[data-due-date]')),
        pointsPossible: parsePoints(pointsElement?.getAttribute('data-points-possible') ?? pointsElement?.textContent),
        status: visibleStatus(container)
      });
    });
    state.announcements = deduplicateById(announcements);
    state.assignments = deduplicateById(assignments);
    state.exams = deduplicateById(exams);
    const assignmentPageDetected = /\/d2l\/lms\/dropbox\//i.test(url.pathname) || assignmentContainers.size > 0;
     const diagnostics: ExtractionDiagnostics = {
      adapterSelected: this.id,
      hostname: url.hostname,
      pathname: url.pathname,
      candidateCourseLinks: courseAnchors.length,
      candidateHrefPatterns: [...hrefPatterns],
      potentialCourseCardContainers: courseCardContainers.size,
      scannedDomRoots: roots.length,
      candidateCourseHosts: courseAnchors.filter((element) => element.matches('d2l-enrollment-card, d2l-card, [data-org-unit-id]')).length,
      candidateAnnouncementContainers: announcementContainers.size,
      candidateAnnouncementTitles,
      assignmentPageDetected,
      candidateAssignmentLinks: assignmentAnchors.length,
      candidateAssignmentContainers: assignmentContainers.size,
      candidateExamLinks: examAnchors.length,
      candidateExamContainers: examContainers.size
    };
    state.diagnostics = diagnostics;
    return state;
  }
}
