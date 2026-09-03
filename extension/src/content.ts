import type { AcademicState, SemesterScanStatus } from '@academic/core';
import { extractAcademicState } from './detection';
import { discoverAcademicTargets } from './semester/page-discovery';
import { discoverTargetDocuments } from './documents/classification';
import { installAcademicBridge } from './webmcp/bridge-server';
import { BRIDGE_CHANNEL } from './webmcp/protocol';
import { ACADEMIC_TOOL_NAMES } from './webmcp/tools';
import type { WebMcpStatus } from './webmcp/runtime';

let currentState: AcademicState | undefined;
let observer: MutationObserver | undefined;
let debounceTimer: number | undefined;
let webMcpStatus: WebMcpStatus = { modelContextAvailable: false, registerToolAvailable: false, supported: false, bridgeConnected: false, expectedTools: [...ACADEMIC_TOOL_NAMES], registeredTools: [], registrationErrors: [] };

function isAcademicState(value: unknown): value is AcademicState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<AcademicState>;
  return typeof state.sourcePlatform === 'string' && typeof state.lastObservedAt === 'string' && Array.isArray(state.courses) && Array.isArray(state.assignments) && Array.isArray(state.exams) && Array.isArray(state.announcements) && Array.isArray(state.classMeetings) && Array.isArray(state.documents) && Array.isArray(state.policies) && Array.isArray(state.officeHours) && Array.isArray(state.conflicts);
}

const removeBridge = installAcademicBridge(async () => {
  refreshState();
  let state = currentState ?? extractAcademicState(document, location.href);
  let scanStatus: SemesterScanStatus = state.sourcePlatform === 'ub-brightspace' ? 'idle' : 'complete';
  if (state.sourcePlatform === 'ub-brightspace') {
    const stored = await chrome.storage.local.get(['academicSemesterState', 'academicSemesterScanStatus']);
    if (isAcademicState(stored.academicSemesterState)) state = stored.academicSemesterState;
    if (typeof stored.academicSemesterScanStatus === 'string') scanStatus = stored.academicSemesterScanStatus as SemesterScanStatus;
  }
  return { state, scanStatus };
});

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
    sendResponse({ state: currentState, targets: discoverAcademicTargets(document, new URL(location.href)), documents: discoverTargetDocuments(document, new URL(location.href), currentState?.courses[0]) });
  }
});

window.addEventListener('pagehide', () => {
  removeBridge();
  observer?.disconnect();
  observer = undefined;
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
}, { once: true });




