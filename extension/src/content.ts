import type { AcademicState, Course, SemesterScanStatus } from '@academic/core';
import { extractAcademicState } from './detection';
import { discoverAcademicNavigation } from './semester/page-discovery';
import { discoverTargetDocuments, discoverDocumentCandidates } from './documents/classification';
import { installAcademicBridge } from './webmcp/bridge-server';
import { BRIDGE_CHANNEL } from './webmcp/protocol';
import { ACADEMIC_TOOL_NAMES } from './webmcp/tools';
import type { WebMcpStatus } from './webmcp/runtime';
import { buildClickObservation, hasAccessibleMyCoursesComponent, inspectCourseDiscovery, sanitizeElement, type ClickObservation } from './course-discovery-inspector';

let currentState: AcademicState | undefined;
let observer: MutationObserver | undefined;
let debounceTimer: number | undefined;
let webMcpStatus: WebMcpStatus = { modelContextAvailable: false, registerToolAvailable: false, supported: false, bridgeConnected: false, expectedTools: [...ACADEMIC_TOOL_NAMES], registeredTools: [], registrationErrors: [] };
let clickObserverArmed = false;

async function finishPendingNavigationObservation(): Promise<void> {
  const stored = await chrome.storage.local.get('academicCourseClickObservation');
  const pending = stored.academicCourseClickObservation as ClickObservation | undefined;
  if (pending?.status !== 'clicked') return;
  const before = new URL(location.origin + pending.beforePath);
  const completed = buildClickObservation(before, new URL(location.href), pending.targetChain);
  if (completed.pathChanged) await chrome.storage.local.set({ academicCourseClickObservation: completed });
}

function observeNextCourseClick(): boolean {
  if (!hasAccessibleMyCoursesComponent(document)) return false;
  if (clickObserverArmed) return true;
  clickObserverArmed = true;
  const armed: ClickObservation = { observedAt: new Date().toISOString(), beforePath: location.pathname, pathChanged: false, targetChain: [], status: 'armed' };
  void chrome.storage.local.set({ academicCourseClickObservation: armed });
  document.addEventListener('click', (event) => {
    clickObserverArmed = false;
    const before = new URL(location.href);
    const chain = event.composedPath().filter((item): item is Element => item instanceof Element).slice(0, 8)
      .map((element) => sanitizeElement(element, before));
    const clicked = buildClickObservation(before, undefined, chain);
    void chrome.storage.local.set({ academicCourseClickObservation: clicked });
    const checkNavigation = (attempt: number): void => {
      const completed = buildClickObservation(before, new URL(location.href), chain);
      if (completed.pathChanged || attempt >= 4) {
        void chrome.storage.local.set({ academicCourseClickObservation: completed });
        return;
      }
      window.setTimeout(() => checkNavigation(attempt + 1), 750);
    };
    window.setTimeout(() => checkNavigation(1), 250);
  }, { capture: true, once: true });
  return true;
}

function isAcademicState(value: unknown): value is AcademicState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<AcademicState>;
  return typeof state.sourcePlatform === 'string' && typeof state.lastObservedAt === 'string' && Array.isArray(state.courses) && Array.isArray(state.assignments) && Array.isArray(state.exams) && Array.isArray(state.announcements) && Array.isArray(state.classMeetings) && Array.isArray(state.documents) && Array.isArray(state.policies) && Array.isArray(state.officeHours) && Array.isArray(state.conflicts);
}

const removeBridge = window === window.top ? installAcademicBridge(async () => {
  refreshState();
  let state = currentState ?? extractAcademicState(document, location.href);
  let scanStatus: SemesterScanStatus = state.sourcePlatform === 'ub-brightspace' ? 'idle' : 'complete';
  if (state.sourcePlatform === 'ub-brightspace') {
    const stored = await chrome.storage.local.get(['academicSemesterState', 'academicSemesterScanStatus']);
    if (isAcademicState(stored.academicSemesterState)) state = stored.academicSemesterState;
    if (typeof stored.academicSemesterScanStatus === 'string') scanStatus = stored.academicSemesterScanStatus as SemesterScanStatus;
  }
  return { state, scanStatus };
}) : () => undefined;

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin || typeof event.data !== 'object' || event.data === null) return;
  const data = event.data as { channel?: string; direction?: string; status?: WebMcpStatus };
  if (data.channel === BRIDGE_CHANNEL && data.direction === 'status' && data.status) webMcpStatus = data.status;
});

function refreshState(): void {
  currentState = extractAcademicState(document, location.href);
}

function scheduleRefresh(): void {
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = undefined;
    refreshState();
  }, 350);
}

function beginWatching(): void {
  refreshState();
  void finishPendingNavigationObservation();
  if (!document.body || observer) return;
  observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', beginWatching, { once: true });
} else {
  beginWatching();
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return;
  if (message.type === 'ACADEMIC_STATE') {
    refreshState();
    sendResponse(currentState);
  }
  if (message.type === 'WEBMCP_STATUS') {
    sendResponse(webMcpStatus);
  }
  if (message.type === 'COLLECT_PAGE') {
    refreshState();
    const context = 'course' in message ? message.course as Course | undefined : undefined;
    const navigationTargets = discoverAcademicNavigation(document, new URL(location.href));
    sendResponse({ state: currentState, targets: navigationTargets.map((target) => target.url), navigationTargets, discoveryCandidates: discoverDocumentCandidates(document, new URL(location.href)), documents: discoverTargetDocuments(document, new URL(location.href), context ?? currentState?.courses[0]) });
  }
  if (message.type === 'INSPECT_COURSE_DISCOVERY') {
    try {
      sendResponse({ ok: true, report: inspectCourseDiscovery(document, new URL(location.href)) });
    } catch (error) {
      const category = error instanceof Error && error.name ? `inspection_${error.name.toLowerCase()}` : 'inspection_unknown_error';
      sendResponse({ ok: false, error: category, framePath: location.pathname });
    }
  }
  if (message.type === 'OBSERVE_COURSE_CLICK') {
    sendResponse({ armed: observeNextCourseClick(), framePath: location.pathname });
  }
});

window.addEventListener('pagehide', () => {
  removeBridge();
  observer?.disconnect();
  observer = undefined;
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
}, { once: true });




