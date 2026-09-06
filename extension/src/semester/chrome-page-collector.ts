import type { Course, DocumentReference } from '@academic/core';
import { DocumentAnalyzer, processDocuments } from '../documents/analyzer';
import { sendMessageToFrames } from '../frame-messaging';
import { mergeAcademicStates, type CollectedPage, type PageCollector } from './collector';

export interface PageResponse extends CollectedPage { documents?: DocumentReference[]; }
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function waitForTab(tabId: number): Promise<void> {
  const current = await chrome.tabs.get(tabId);
  if (current.status === 'complete') return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('Timed out loading authorized course page')); }, 20_000);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId !== tabId || change.status !== 'complete') return;
      window.clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
export function mergePageResponses(responses: PageResponse[]): PageResponse {
  const first = responses[0];
  if (!first) throw new Error('No authorized frame responded');
  const navigation = new Map<string, NonNullable<PageResponse['navigationTargets']>[number]>();
  const candidates = new Map<string, NonNullable<PageResponse['discoveryCandidates']>[number]>();
  const documents = new Map<string, DocumentReference>();
  let state = first.state;
  for (const response of responses) {
    if (response !== first) state = mergeAcademicStates(state, response.state);
    for (const target of response.navigationTargets ?? []) navigation.set(target.url, target);
    for (const candidate of response.discoveryCandidates ?? []) candidates.set(candidate.sourceUrl, candidate);
    for (const document of response.documents ?? []) documents.set(document.sourceUrl, document);
  }
  const targets = [...new Set(responses.flatMap((response) => response.targets))];
  return {
    state, targets, navigationTargets: [...navigation.values()], discoveryCandidates: [...candidates.values()],
    documents: [...documents.values()], partial: responses.some((response) => response.partial === true)
  };
}

async function readPage(tabId: number, course?: Course): Promise<PageResponse> {
  let responses = await sendMessageToFrames<PageResponse>(tabId, { type: 'COLLECT_PAGE', course });
  if (!responses.length) {
    await delay(700);
    responses = await sendMessageToFrames<PageResponse>(tabId, { type: 'COLLECT_PAGE', course });
  }
  return mergePageResponses(responses);
}

export class ChromePageCollector implements PageCollector {
  private readonly analyzer = new DocumentAnalyzer();
  private readonly processed = new Set<string>();
  private readonly documentCounts = new Map<string, number>();
  private readonly courses = new Map<string, Course>();

  async collect(url: string, context?: Course): Promise<CollectedPage> {
    const parsed = new URL(url);
    if (parsed.hostname !== 'ublearns.buffalo.edu' || !parsed.pathname.startsWith('/d2l/')) throw new Error('Collection target is outside the authorized UB Learns scope');
    const tab = await chrome.tabs.create({ url: parsed.href, active: false });
    if (tab.id === undefined) throw new Error('Chrome did not create a collection tab');
    try {
      await waitForTab(tab.id); await delay(500);
      const page = await readPage(tab.id, context);
      for (const course of page.state.courses) this.courses.set(course.id, course);
      const course = context ?? page.state.courses[0] ?? [...this.courses.values()].find((item) => page.documents?.some((document) => document.courseId === item.id));
      if (!course || !page.documents?.length) return page;
      const unseen = page.documents.filter((document) => !this.processed.has(document.sourceUrl));
      const used = this.documentCounts.get(course.id) ?? 0;
      const available = Math.max(0, 10 - used);
      const selected = unseen.slice(0, available);
      selected.forEach((document) => this.processed.add(document.sourceUrl));
      this.documentCounts.set(course.id, used + selected.length);
      const documents = await processDocuments(selected, course, this.analyzer, available);
      return {
        state: mergeAcademicStates(page.state, documents.state),
        targets: page.targets,
        navigationTargets: page.navigationTargets,
        discoveryCandidates: page.discoveryCandidates,
        partial: unseen.length > available || documents.partial
      };
    } finally { await chrome.tabs.remove(tab.id).catch(() => undefined); }
  }
}
