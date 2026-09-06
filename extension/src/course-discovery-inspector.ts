export type DiscoveryStrategy = 'DOM_LINK' | 'CLICK_NAVIGATION' | 'SAME_ORIGIN_FRAME' | 'ACCESSIBLE_CUSTOM_ELEMENT' | 'NO_SAFE_DOM_PATH_FOUND';

export interface SanitizedElementRecord {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
  ariaLabel?: string;
  href?: string;
  dataAttributes: Record<string, string>;
  shadowRootAccessible?: boolean;
  shadowChildCount?: number;
  childCount: number;
  textSnippet?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  clickability: string[];
  closestCustomElement?: string;
  shadowHostPath?: string[];
  frameContextPath: string;
  orgUnitLikeIdPresent: boolean;
}

export interface SanitizedFrameRecord {
  origin: string;
  pathname: string;
  sandbox?: string;
  sameOrigin: boolean;
  contentDocumentAccessible: boolean;
  overlapsMyCourses: boolean;
}

export interface ClickObservation {
  observedAt: string;
  beforePath: string;
  afterPath?: string;
  pathChanged: boolean;
  orgUnitLikeId?: string;
  targetChain: SanitizedElementRecord[];
  status: 'armed' | 'clicked' | 'navigation-observed' | 'no-navigation-observed';
}

export interface CourseDiscoveryReport {
  reportVersion: 2;
  inspectedAt: string;
  framePath: string;
  myCoursesContainerFound: boolean;
  structure: SanitizedElementRecord[];
  customElements: SanitizedElementRecord[];
  accessibleShadowRoots: number;
  iframes: SanitizedFrameRecord[];
  clickableCandidates: SanitizedElementRecord[];
  courseLikeTextCandidates: number;
  courseLinkHrefs: number;
  orgUnitLikeIdsFound: number;
  courseTextVisible: boolean;
  navigationTargetExposed: boolean;
  performanceResources: string[];
  likelyDiscoveryStrategy: DiscoveryStrategy;
  clickObservation?: ClickObservation;
  limitations: string[];
}

export type CourseInspectorResponse =
  | { ok: true; report: CourseDiscoveryReport }
  | { ok: false; error: string; framePath: string };

const maximumStructure = 30;
const maximumCandidates = 30;
const courseTextPattern = /\b[A-Z]{2,5}\s*\d{2,4}[A-Z]*(?:\s+[A-Z0-9]+)?\b|\(\d{4,}\s+(?:fall|spring|summer|winter)\s+\d{2,4}\)/i;
const orgUnitPattern = /(?:\/d2l\/home\/|\b(?:ou|org[-_ ]?unit(?:id)?)\D{0,4})(\d{4,})/i;

function safeUrl(raw: string, base: URL): string | undefined {
  try {
    const parsed = new URL(raw, base);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return parsed.origin + parsed.pathname;
  } catch { return undefined; }
}

function sanitizedText(element: Element): string | undefined {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (courseTextPattern.test(text)) return '[course-like text redacted]';
  if (/\b[\w.+-]+@[\w.-]+\.\w+\b/.test(text)) return '[personal text redacted]';
  return text.slice(0, 80);
}

function rectangle(element: Element): SanitizedElementRecord['boundingBox'] {
  const box = element.getBoundingClientRect();
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
}

function customAncestor(element: Element): string | undefined {
  let current: Element | null = element;
  while (current) {
    if (current.tagName.includes('-')) return current.tagName.toLowerCase();
    current = current.parentElement;
  }
  return undefined;
}

function shadowHostPath(element: Element): string[] {
  const path: string[] = [];
  let current: Node = element;
  for (let depth = 0; depth < 12; depth += 1) {
    const root = current.getRootNode();
    if (!(root instanceof ShadowRoot)) break;
    path.push(root.host.tagName.toLowerCase());
    current = root.host;
  }
  return path;
}

function clickability(element: Element, view: Window): string[] {
  const hints: string[] = [];
  if (element.matches('a')) hints.push('anchor');
  if (element.matches('button')) hints.push('button');
  const role = element.getAttribute('role');
  if (role === 'link' || role === 'button') hints.push(`role-${role}`);
  if (element.hasAttribute('tabindex')) hints.push('tabindex');
  try { if ((element as HTMLElement).onclick) hints.push('onclick-property'); } catch { /* custom getter unavailable */ }
  try { if (view.getComputedStyle(element).cursor === 'pointer') hints.push('pointer-cursor'); } catch { /* unavailable */ }
  return hints;
}

export function sanitizeElement(element: Element, base: URL, view: Window = window): SanitizedElementRecord {
  const dataAttributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (!attribute.name.startsWith('data-')) continue;
    if (/token|session|auth|email|user/i.test(attribute.name)) continue;
    dataAttributes[attribute.name] = /^\d+$/.test(attribute.value) || /^(?:true|false|course|offering)$/i.test(attribute.value) ? attribute.value : '[redacted]';
    if (Object.keys(dataAttributes).length >= 8) break;
  }
  const rawHref = element.getAttribute('href') ?? element.getAttribute('data-href') ?? element.getAttribute('data-url') ?? element.getAttribute('url');
  const searchable = `${rawHref ?? ''} ${Object.entries(dataAttributes).map(([key, value]) => `${key}=${value}`).join(' ')}`;
  const record: SanitizedElementRecord = {
    tag: element.tagName.toLowerCase(), dataAttributes, childCount: element.childElementCount, frameContextPath: base.pathname,
    clickability: clickability(element, view), closestCustomElement: customAncestor(element),
    orgUnitLikeIdPresent: orgUnitPattern.test(searchable), boundingBox: rectangle(element)
  };
  const hostPath = shadowHostPath(element); if (hostPath.length) record.shadowHostPath = hostPath;
  const id = element.id.trim(); if (id && !/user|email|name/i.test(id)) record.id = id.slice(0, 80);
  if (element.classList.length) record.classes = Array.from(element.classList).slice(0, 8).map((name) => name.slice(0, 60));
  const role = element.getAttribute('role'); if (role) record.role = role.slice(0, 40);
  const aria = element.getAttribute('aria-label'); if (aria) record.ariaLabel = courseTextPattern.test(aria) ? '[course-like text redacted]' : aria.slice(0, 80);
  if (rawHref) record.href = safeUrl(rawHref, base);
  record.textSnippet = sanitizedText(element);
  if (element.tagName.includes('-')) {
    record.shadowRootAccessible = element.shadowRoot !== null;
    if (element.shadowRoot) record.shadowChildCount = element.shadowRoot.childElementCount;
  }
  return record;
}

function roots(document: Document): Array<Document | ShadowRoot> {
  const result: Array<Document | ShadowRoot> = [document];
  for (let index = 0; index < result.length && result.length < 40; index += 1) {
    result[index]?.querySelectorAll<HTMLElement>('*').forEach((element) => {
      if (result.length < 40 && element.shadowRoot && !result.includes(element.shadowRoot)) result.push(element.shadowRoot);
    });
  }
  return result;
}

function composedSubtree(host: Element): Element[] {
  const result: Element[] = [host];
  const pending: Array<Element | ShadowRoot> = [host];
  for (let index = 0; index < pending.length && result.length < 500; index += 1) {
    const current = pending[index];
    if (!current) continue;
    const children = current instanceof ShadowRoot ? Array.from(current.children) : Array.from(current.children);
    for (const child of children) {
      if (result.length >= 500) break;
      result.push(child); pending.push(child);
      if (child.shadowRoot) pending.push(child.shadowRoot);
    }
    if (current instanceof Element && current.shadowRoot) pending.push(current.shadowRoot);
  }
  return [...new Set(result)];
}

export function hasAccessibleMyCoursesComponent(document: Document): boolean {
  return roots(document).some((root) => {
    const component = root.querySelector('d2l-my-courses-v2');
    return component !== null && component.shadowRoot !== null;
  });
}

function overlaps(left: DOMRect, right: DOMRect): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

export function inspectCourseDiscovery(document: Document, url: URL, performanceApi: Performance = performance): CourseDiscoveryReport {
  const allRoots = roots(document);
  const elements = allRoots.flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('*')));
  const component = elements.find((element) => element.tagName.toLowerCase() === 'd2l-my-courses-v2');
  const label = elements.filter((element) => /\bmy courses\b/i.test(element.textContent ?? '')).sort((a, b) => a.childElementCount - b.childElementCount)[0];
  let myCourses = component ?? label;
  if (!component) {
    for (let depth = 0; label && myCourses?.parentElement && depth < 5; depth += 1) {
      const parent = myCourses.parentElement;
      const hasWidgetContent = parent.querySelector('a, button, [role="link"], [role="button"], [tabindex], iframe, *[data-org-unit-id], d2l-enrollment-card, d2l-card') !== null;
      if (hasWidgetContent && (parent.textContent?.length ?? 0) < 10_000) { myCourses = parent; break; }
      myCourses = parent;
    }
  }
  const areaBox = myCourses?.getBoundingClientRect();
  const nearby = myCourses ? composedSubtree(myCourses) : [];
  const custom = nearby.filter((element) => element.tagName.includes('-')).slice(0, maximumCandidates);
  const interactive = nearby.filter((element) => clickability(element, document.defaultView ?? window).length > 0).slice(0, maximumCandidates);
  const courseLike = nearby.filter((element) => courseTextPattern.test(element.textContent ?? ''));
  const courseLinks = interactive.filter((element) => /\/d2l\/home\/\d+/i.test(element.getAttribute('href') ?? element.getAttribute('data-href') ?? element.getAttribute('data-url') ?? ''));
  const frameRecords = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe')).slice(0, 20).map((frame): SanitizedFrameRecord => {
    const raw = frame.getAttribute('src') ?? '';
    let parsed: URL | undefined;
    try { parsed = new URL(raw || 'about:blank', url); } catch { parsed = undefined; }
    const sameOrigin = parsed?.origin === url.origin || parsed?.protocol === 'about:';
    let accessible = false;
    if (sameOrigin) { try { accessible = frame.contentDocument !== null; } catch { accessible = false; } }
    return {
      origin: parsed?.origin ?? 'invalid', pathname: parsed?.pathname ?? '', sandbox: frame.getAttribute('sandbox') ?? undefined,
      sameOrigin, contentDocumentAccessible: accessible,
      overlapsMyCourses: areaBox ? overlaps(frame.getBoundingClientRect(), areaBox) : false
    };
  });
  const resources = performanceApi.getEntriesByType('resource').flatMap((entry) => {
    try {
      const resource = new URL(entry.name, url);
      return resource.origin === url.origin && /course|enrollment|mycourses|orgunits|\/d2l\/api\/|\/lp\//i.test(resource.pathname)
        ? [resource.origin + resource.pathname] : [];
    } catch { return []; }
  }).filter((value, index, list) => list.indexOf(value) === index).slice(0, 30);
  const customRecords = custom.map((element) => sanitizeElement(element, url, document.defaultView ?? window));
  const clickableRecords = interactive.map((element) => sanitizeElement(element, url, document.defaultView ?? window));
  const accessibleShadowRoots = custom.filter((element) => element.shadowRoot !== null).length;
  let strategy: DiscoveryStrategy = 'NO_SAFE_DOM_PATH_FOUND';
  if (courseLinks.length) strategy = 'DOM_LINK';
  else if (customRecords.some((record) => record.shadowRootAccessible) && courseLike.length) strategy = 'ACCESSIBLE_CUSTOM_ELEMENT';
  else if (frameRecords.some((frame) => frame.sameOrigin && frame.contentDocumentAccessible && frame.overlapsMyCourses)) strategy = 'SAME_ORIGIN_FRAME';
  else if (interactive.length && courseLike.length) strategy = 'CLICK_NAVIGATION';
  const orgIds = [...customRecords, ...clickableRecords].filter((record) => record.orgUnitLikeIdPresent).length;
  return {
    reportVersion: 2, inspectedAt: new Date().toISOString(), framePath: url.pathname, myCoursesContainerFound: myCourses !== undefined,
    structure: nearby.slice(0, maximumStructure).map((element) => sanitizeElement(element, url, document.defaultView ?? window)),
    customElements: customRecords, accessibleShadowRoots, iframes: frameRecords, clickableCandidates: clickableRecords,
    courseLikeTextCandidates: courseLike.length, courseLinkHrefs: courseLinks.length, orgUnitLikeIdsFound: orgIds,
    courseTextVisible: courseLike.length > 0, navigationTargetExposed: courseLinks.length > 0,
    performanceResources: resources, likelyDiscoveryStrategy: strategy,
    limitations: ['Standard DOM APIs cannot enumerate addEventListener registrations.', 'shadowRootAccessible false does not prove that a closed shadow root exists.', 'Only performance resource URLs already exposed to the page are inspected; bodies and headers are never read.']
  };
}

export function buildClickObservation(before: URL, after: URL | undefined, targetChain: SanitizedElementRecord[]): ClickObservation {
  const match = /\/d2l\/home\/(\d+)/i.exec(after?.pathname ?? '') ?? /\/d2l\/home\/(\d+)/i.exec(before.pathname);
  const changed = after !== undefined && `${before.pathname}${before.hash}` !== `${after.pathname}${after.hash}`;
  return {
    observedAt: new Date().toISOString(), beforePath: before.pathname, afterPath: after?.pathname,
    pathChanged: changed, orgUnitLikeId: match?.[1], targetChain: targetChain.slice(0, 8),
    status: changed ? 'navigation-observed' : after ? 'no-navigation-observed' : 'clicked'
  };
}

export function mergeCourseDiscoveryReports(reports: CourseDiscoveryReport[], clickObservation?: ClickObservation): CourseDiscoveryReport | undefined {
  const first = reports[0]; if (!first) return undefined;
  const strategy = reports.map((report) => report.likelyDiscoveryStrategy).find((value) => value !== 'NO_SAFE_DOM_PATH_FOUND') ?? 'NO_SAFE_DOM_PATH_FOUND';
  return {
    ...first, framePath: '/multiple-frames', myCoursesContainerFound: reports.some((report) => report.myCoursesContainerFound),
    structure: reports.flatMap((report) => report.structure).slice(0, maximumStructure),
    customElements: reports.flatMap((report) => report.customElements).slice(0, maximumCandidates),
    accessibleShadowRoots: reports.reduce((sum, report) => sum + report.accessibleShadowRoots, 0),
    iframes: reports.flatMap((report) => report.iframes).slice(0, 20),
    clickableCandidates: reports.flatMap((report) => report.clickableCandidates).slice(0, maximumCandidates),
    courseLikeTextCandidates: reports.reduce((sum, report) => sum + report.courseLikeTextCandidates, 0),
    courseLinkHrefs: reports.reduce((sum, report) => sum + report.courseLinkHrefs, 0),
    orgUnitLikeIdsFound: reports.reduce((sum, report) => sum + report.orgUnitLikeIdsFound, 0),
    courseTextVisible: reports.some((report) => report.courseTextVisible),
    navigationTargetExposed: reports.some((report) => report.navigationTargetExposed),
    performanceResources: [...new Set(reports.flatMap((report) => report.performanceResources))].slice(0, 30),
    likelyDiscoveryStrategy: strategy, clickObservation,
    limitations: [...new Set(reports.flatMap((report) => report.limitations))]
  };
}
