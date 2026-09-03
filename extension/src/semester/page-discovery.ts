import { cleanText } from '@academic/core';

const targetShadowHosts = 'd2l-navigation-main-header,d2l-menu,d2l-list-item,d2l-card,d2l-table';
const categoryHints = new Set(['homework', 'midterms', 'projects', 'assessments']);
const maximumTargets = 6;

function roots(document: Document): Array<Document | ShadowRoot> {
  const found: Array<Document | ShadowRoot> = [document];
  for (let index = 0; index < found.length && found.length < 20; index += 1) {
    found[index]?.querySelectorAll<HTMLElement>(targetShadowHosts).forEach((host) => {
      if (host.shadowRoot && !found.includes(host.shadowRoot)) found.push(host.shadowRoot);
    });
  }
  return found;
}

function safeTarget(anchor: HTMLAnchorElement, pageUrl: URL): string | undefined {
  let target: URL;
  try {
    target = new URL(anchor.getAttribute('href') ?? anchor.href, pageUrl);
  } catch {
    return undefined;
  }
  if (target.hostname !== pageUrl.hostname || !target.pathname.startsWith('/d2l/')) return undefined;
  const isAssignment = /\/d2l\/lms\/dropbox\//i.test(target.pathname);
  const isAssessment = /\/d2l\/lms\/quizzing\//i.test(target.pathname);
  const isHintedCategory = /\/d2l\/le\/content\//i.test(target.pathname) &&
    categoryHints.has(cleanText(anchor.textContent)?.toLocaleLowerCase() ?? '');
  if (!isAssignment && !isAssessment && !isHintedCategory) return undefined;
  const safe = new URL(target.origin + target.pathname);
  for (const key of ['ou', 'db', 'qi']) {
    const value = target.searchParams.get(key);
    if (value && /^\d+$/.test(value)) safe.searchParams.set(key, value);
  }
  return safe.href;
}

export function discoverAcademicTargets(document: Document, pageUrl: URL): string[] {
  const targets = new Set<string>();
  for (const root of roots(document)) {
    root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
      if (targets.size >= maximumTargets) return;
      const target = safeTarget(anchor, pageUrl);
      if (target) targets.add(target);
    });
    if (targets.size >= maximumTargets) break;
  }
  return [...targets];
}
