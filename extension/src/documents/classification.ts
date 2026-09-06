import { cleanText, stableId, type Course, type DocumentReference, type DocumentType } from '@academic/core';

const rules: Array<[DocumentType, RegExp]> = [
  ['syllabus', /\b(?:course\s+)?syllabus\b|\bsyllabus\s*(?:&|and)\s*info(?:rmation)?\b/i],
  ['exam-schedule', /\b(?:exam|midterm|final(?:\s+exam)?|quiz|assessment)\s+(?:schedule|information)\b|\bfinal\s+exam\b/i],
  ['assignment', /\b(?:assignment|homework|project\s+(?:instructions?|guidelines|\d+)|problem\s+set|lab\s+assignment)\b/i],
  ['course-policy', /\b(?:course|grading|attendance)\s+polic(?:y|ies)\b|^\s*policies(?: and procedures)?\s*$|\bcourse information\b/i]
];

export const documentPriority: Record<DocumentType, number> = {
  syllabus: 0, 'exam-schedule': 1, assignment: 2, 'course-policy': 3
};

export function classifyDocumentTitle(title: string): DocumentType | undefined {
  const value = cleanText(title);
  return value ? rules.find(([, pattern]) => pattern.test(value))?.[0] : undefined;
}

export function safeDocumentUrl(href: string, pageUrl: URL): URL | undefined {
  try {
    const url = new URL(href, pageUrl);
    if (url.username || url.password) return;
    if (url.protocol !== 'https:' || url.origin !== pageUrl.origin || url.hostname !== 'ublearns.buffalo.edu' || !(url.pathname.startsWith('/d2l/') || url.pathname.startsWith('/content/enforced/'))) return;
    for (const [key, value] of [...url.searchParams]) {
      if (!['ou', 'file', 'item', 'content'].includes(key) || !/^\d+$/.test(value)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url;
  } catch {
    return;
  }
}

function openRoots(document: Document): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [document];
  for (let index = 0; index < roots.length && index < 40; index += 1) {
    for (const element of Array.from(roots[index]?.querySelectorAll('*') ?? [])) {
      if (element.shadowRoot && roots.length < 40 && !roots.includes(element.shadowRoot)) roots.push(element.shadowRoot);
    }
  }
  return roots;
}

export function discoverTargetDocuments(document: Document, pageUrl: URL, course?: Course): DocumentReference[] {
  if (!course) return [];
  const observedAt = new Date().toISOString();
  const found = new Map<string, DocumentReference>();
  const anchors = openRoots(document).flatMap((root) => Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')));
  for (const anchor of anchors) {
    if (anchor.closest('[hidden], [aria-hidden="true"]')) continue;
    const title = cleanText(anchor.textContent) ?? cleanText(anchor.getAttribute('aria-label')) ?? cleanText(anchor.getAttribute('title'));
    if (!title) continue;
    const documentType = classifyDocumentTitle(title);
    const url = documentType ? safeDocumentUrl(anchor.getAttribute('href') ?? '', pageUrl) : undefined;
    if (!documentType || !url) continue;
    const sourceUrl = url.href;
    if (found.has(sourceUrl)) continue;
    found.set(sourceUrl, {
      id: stableId('document', course.id, sourceUrl),
      courseId: course.id,
      courseCode: course.courseCode,
      title,
      documentType,
      mimeType: url.pathname.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined,
      textExtractionStatus: 'pending',
      processing: { discoveryPage: pageUrl.origin + pageUrl.pathname, classificationResult: documentType, fetchStatus: 'pending', extractionStatus: 'pending', textCharacterCount: 0, factCount: 0 },
      sourcePlatform: 'ub-brightspace',
      sourceUrl,
      sourceTitle: title,
      sourceType: documentType,
      extractedFrom: 'visible-dom',
      lastObservedAt: observedAt
    });
  }
  return [...found.values()].sort((a, b) => documentPriority[a.documentType] - documentPriority[b.documentType]);
}

// Debug metadata only: no descriptions, raw markup, query secrets, or document text.
export function discoverDocumentCandidates(document: Document, pageUrl: URL): Array<{ title: string; sourceUrl: string; discoveryPage: string; classificationResult: string }> {
  const found = new Map<string, { title: string; sourceUrl: string; discoveryPage: string; classificationResult: string }>();
  for (const root of openRoots(document)) {
    for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      if (found.size >= 100) break;
      if (anchor.closest('[hidden], [aria-hidden="true"]')) continue;
      const url = safeDocumentUrl(anchor.getAttribute('href') ?? '', pageUrl);
      const title = cleanText(anchor.textContent) ?? cleanText(anchor.getAttribute('aria-label'));
      if (!url || !title || !(/\/le\/content\/|\/content\/enforced\/|\.pdf$/i.test(url.pathname))) continue;
      found.set(url.href, { title: title.slice(0, 200), sourceUrl: url.href, discoveryPage: pageUrl.origin + pageUrl.pathname, classificationResult: classifyDocumentTitle(title) ?? 'ignored_non_target' });
    }
  }
  return [...found.values()];
}





