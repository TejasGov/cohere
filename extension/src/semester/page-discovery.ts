import { cleanText } from '@academic/core';
import { classifyDocumentTitle } from '../documents/classification';

export type NavigationPageType = 'content-entry' | 'module' | 'topic' | 'assignment' | 'assessment';
export interface AcademicNavigationTarget { url: string; pageType: NavigationPageType; label: string; }

const entryLabels = /^(content|course content|modules|materials)$/i;
const relevantModuleLabels = /syllabus|course\s+(information|polic)|policies|assignment|project|exam|assessment/i;
const ignoredModuleLabels = /lecture|slides?|readings?|recordings?|textbooks?|generic resources?/i;
const maximumRoots = 40;
const maximumTargets = 24;

function roots(document: Document): Array<Document | ShadowRoot> {
  const found: Array<Document | ShadowRoot> = [document];
  for (let index = 0; index < found.length && found.length < maximumRoots; index += 1) {
    found[index]?.querySelectorAll<HTMLElement>('*').forEach((host) => {
      if (found.length < maximumRoots && host.shadowRoot && !found.includes(host.shadowRoot)) found.push(host.shadowRoot);
    });
  }
  return found;
}

function anchorLabel(anchor: HTMLAnchorElement): string {
  return cleanText(anchor.textContent) ?? cleanText(anchor.getAttribute('aria-label')) ?? cleanText(anchor.getAttribute('title')) ?? '';
}

function safeUrl(anchor: HTMLAnchorElement, pageUrl: URL): URL | undefined {
  let target: URL;
  try { target = new URL(anchor.getAttribute('href') ?? anchor.href, pageUrl); } catch { return undefined; }
  if (target.origin !== pageUrl.origin || !target.pathname.startsWith('/d2l/')) return undefined;
  const safe = new URL(target.origin + target.pathname);
  for (const key of ['ou', 'db', 'qi']) {
    const value = target.searchParams.get(key);
    if (value && /^\d+$/.test(value)) safe.searchParams.set(key, value);
  }
  const itemIdentifier = target.searchParams.get('itemIdentifier');
  if (itemIdentifier && /^D2L\.LE\.Content\.ContentObject\.(?:Module|Topic)CO-\d+$/i.test(itemIdentifier)) safe.searchParams.set('itemIdentifier', itemIdentifier);
  return safe;
}

function classify(anchor: HTMLAnchorElement, pageUrl: URL): AcademicNavigationTarget | undefined {
  const target = safeUrl(anchor, pageUrl);
  if (!target) return undefined;
  const label = anchorLabel(anchor);
  const path = target.pathname;
  if (/\/d2l\/lms\/dropbox\//i.test(path)) return { url: target.href, pageType: 'assignment', label };
  if (/\/d2l\/lms\/quizzing\//i.test(path)) return { url: target.href, pageType: 'assessment', label };
  if (!/\/d2l\/le\/content\//i.test(path)) return undefined;

  const onCourseHome = /^\/d2l\/home\/\d+\/?$/i.test(pageUrl.pathname);
  if (onCourseHome && entryLabels.test(label)) return { url: target.href, pageType: 'content-entry', label };
  if (ignoredModuleLabels.test(label)) return undefined;
  const itemIdentifier = target.searchParams.get('itemIdentifier') ?? '';
  const isModule = /ModuleCO-/i.test(itemIdentifier) || /\/Home\/?$/i.test(path);
  const isTopic = /TopicCO-/i.test(itemIdentifier) || /\/viewContent\/\d+\/View\/?$/i.test(path);
  if (isModule && relevantModuleLabels.test(label)) return { url: target.href, pageType: 'module', label };
  if (isTopic && classifyDocumentTitle(label)) return { url: target.href, pageType: 'topic', label };
  if (classifyDocumentTitle(label)) return { url: target.href, pageType: 'topic', label };
  return undefined;
}

export function discoverAcademicNavigation(document: Document, pageUrl: URL): AcademicNavigationTarget[] {
  const targets = new Map<string, AcademicNavigationTarget>();
  for (const root of roots(document)) {
    root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
      if (targets.size >= maximumTargets || anchor.closest('[hidden], [aria-hidden="true"]')) return;
      const target = classify(anchor, pageUrl);
      if (target && !targets.has(target.url)) targets.set(target.url, target);
    });
    if (targets.size >= maximumTargets) break;
  }
  return [...targets.values()];
}

export function discoverAcademicTargets(document: Document, pageUrl: URL): string[] {
  return discoverAcademicNavigation(document, pageUrl).map((target) => target.url);
}
