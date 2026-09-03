import type { AcademicState, SemesterScanState, SourcePlatform } from '@academic/core';
import { ChromePageCollector } from './semester/chrome-page-collector';
import { SemesterCollector } from './semester/collector';
import type { WebMcpStatus } from './webmcp/runtime';
import './popup.css';

const app = document.querySelector<HTMLElement>('#app') ?? (() => { throw new Error('Popup root is missing'); })();
const labels: Record<SourcePlatform, string> = {
  brightspace: 'Brightspace', 'ub-brightspace': 'UB Learns / Brightspace', blackboard: 'Blackboard',
  'university-portal': 'University Portal', unknown: 'Unsupported page'
};
const emptyWebMcpStatus = (): WebMcpStatus => ({ modelContextAvailable: false, registerToolAvailable: false, supported: false, bridgeConnected: false, expectedTools: [], registeredTools: [], registrationErrors: [] });
let currentState: AcademicState;
let currentScan: SemesterScanState | undefined;
let currentWebMcpStatus = emptyWebMcpStatus();

function courseStatusLabel(status: SemesterScanState['courses'][number]['status']): string {
  if (status === 'complete') return '✓';
  if (status === 'scanning') return 'scanning…';
  if (status === 'pending') return 'waiting';
  return status;
}
function render(state: AcademicState, scan?: SemesterScanState, webMcp = currentWebMcpStatus): void {
  currentState = state; currentScan = scan; currentWebMcpStatus = webMcp;
  const detected = state.sourcePlatform !== 'unknown';
  const scanActive = scan?.status === 'discovering' || scan?.status === 'scanning';
  const scanned = scan?.courses.filter((course) => course.status !== 'pending' && course.status !== 'scanning').length ?? 0;
  const sourcedFacts = [
    ...state.assignments.filter((item) => item.extractedFrom === 'document-text').map((item) => ({ title: item.title, detail: item.dueAt, source: item.sourceReference?.sourceTitle })),
    ...state.exams.filter((item) => item.extractedFrom === 'document-text').map((item) => ({ title: item.title, detail: item.startsAt, source: item.sourceReference?.sourceTitle })),
    ...state.policies.map((item) => ({ title: item.title, detail: item.description, source: item.sourceReference?.sourceTitle })),
    ...state.officeHours.map((item) => ({ title: item.title, detail: item.scheduleText, source: item.sourceReference?.sourceTitle })),
    ...state.classMeetings.filter((item) => item.extractedFrom === 'document-text').map((item) => ({ title: item.title, detail: item.meetingPattern, source: item.sourceReference?.sourceTitle }))
  ];
  const scanSection = state.sourcePlatform === 'ub-brightspace' ? `
    <section class="semester-scan">
      <div class="scan-heading"><h2>Semester scan</h2><span>${scan?.status ?? 'idle'}</span></div>
      <p>Courses discovered: ${scan?.courses.length ?? state.courses.length}<br>Courses scanned: ${scanned}/${scan?.courses.length ?? state.courses.length}</p>
      <ol class="scan-courses"></ol>
      <button id="scan-semester" type="button" ${scanActive ? 'disabled' : ''}>${scanActive ? 'Scanning…' : 'Scan academic semester'}</button>
    </section>` : '';
  app.innerHTML = `<header><span class="mark">A</span><div><h1>Academic Bridge</h1><p>Canonical academic view</p></div></header>
    <section class="platform"><span>Detected Platform</span><strong class="${detected ? 'ready' : 'unsupported'}"></strong></section>
    ${scanSection}
    <section class="webmcp-status">
      <div class="scan-heading"><h2>WebMCP</h2><span>Supported: ${webMcp.supported ? 'Yes' : 'No'}</span></div>
      <p>Bridge: ${webMcp.bridgeConnected ? 'Active' : 'Inactive'}<br>Registered Tools: ${webMcp.registeredTools.length}</p>
      <ul class="webmcp-tools"></ul>
      <details><summary>WebMCP diagnostics</summary><pre class="webmcp-debug"></pre></details>
      ${webMcp.supported ? '' : '<p>WebMCP unsupported in this Chrome environment.</p>'}
    </section>
    <dl>
      <div><dt>Courses</dt><dd>${state.courses.length}</dd></div>
      <div><dt>Assignments</dt><dd>${state.assignments.length}</dd></div>
      <div><dt>Exams</dt><dd>${state.exams.length}</dd></div>
      <div><dt>Class Meetings</dt><dd>${state.classMeetings.length}</dd></div>
      <div><dt>Announcements</dt><dd>${state.announcements.length}</dd></div>
      <div><dt>Documents Scanned</dt><dd>${state.documents.filter((item) => item.textExtractionStatus === 'complete' || item.textExtractionStatus === 'cached').length}</dd></div>
      <div><dt>Important Facts</dt><dd>${sourcedFacts.length}</dd></div>
      <div><dt>Conflicts</dt><dd>${state.conflicts.length}</dd></div>
    </dl>
    <details class="sources"><summary>Sources</summary><ul></ul></details>
    <details><summary>Developer: normalized JSON</summary><pre class="academic-debug"></pre></details>
    <footer>Academic information is processed locally in your browser.</footer>`;
  const platform = app.querySelector<HTMLElement>('.platform strong');
  if (platform) platform.textContent = `${labels[state.sourcePlatform]}${detected ? ' detected' : ''}`;
  const academicDebug = app.querySelector<HTMLElement>('.academic-debug');
  if (academicDebug) academicDebug.textContent = JSON.stringify(state, null, 2);
  const webMcpTools = app.querySelector<HTMLUListElement>('.webmcp-tools');
  webMcp.expectedTools.forEach((name) => {
    const item = document.createElement('li');
    item.textContent = `${name} — ${webMcp.registeredTools.includes(name) ? 'registered' : 'not registered'}`;
    webMcpTools?.append(item);
  });
  const webMcpDebug = app.querySelector<HTMLElement>('.webmcp-debug');
  if (webMcpDebug) webMcpDebug.textContent = JSON.stringify(webMcp, null, 2);
  const sources = app.querySelector<HTMLUListElement>('.sources ul');
  state.documents.forEach((sourceDocument) => {
    const item = document.createElement('li'); item.textContent = `${sourceDocument.title} — ${sourceDocument.documentType} — ${sourceDocument.textExtractionStatus}`; sources?.append(item);
  });
  sourcedFacts.forEach((fact) => {
    const item = document.createElement('li'); item.textContent = `${fact.title}${fact.detail ? ` — ${fact.detail}` : ''} — Source: ${fact.source ?? 'UB Learns'}`; sources?.append(item);
  });
  const courseList = app.querySelector<HTMLOListElement>('.scan-courses');
  scan?.courses.forEach((course) => {
    const item = document.createElement('li');
    const name = course.courseCode ?? course.courseTitle ?? course.orgUnitId ?? 'Course';
    item.textContent = `${name}  ${courseStatusLabel(course.status)}`; courseList?.append(item);
  });
  app.querySelector<HTMLButtonElement>('#scan-semester')?.addEventListener('click', () => void startSemesterScan());
}
function unsupportedState(): AcademicState {
  return { sourcePlatform: 'unknown', sourceUrl: '', lastObservedAt: new Date().toISOString(), courses: [], assignments: [], exams: [], announcements: [], classMeetings: [], documents: [], policies: [], officeHours: [], conflicts: [] };
}
async function startSemesterScan(): Promise<void> {
  if (currentState.sourcePlatform !== 'ub-brightspace' || currentScan?.status === 'scanning') return;
  const collector = new SemesterCollector(new ChromePageCollector());
  try {
    const finalState = await collector.scan(currentState, (progress) => {
      render(progress.academicState, progress);
      void chrome.storage.local.set({ academicSemesterState: progress.academicState, academicSemesterScanStatus: progress.status });
    });
    await chrome.storage.local.set({ academicSemesterState: finalState.academicState, academicSemesterScanStatus: finalState.status });
    render(finalState.academicState, finalState);
  } catch { render(currentState, { status: 'error', courses: currentScan?.courses ?? [], academicState: currentState }); }
}
async function inspect(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return render(unsupportedState());
  try {
    const [state, webMcp] = await Promise.all([
      chrome.tabs.sendMessage(tab.id, { type: 'ACADEMIC_STATE' }) as Promise<AcademicState>,
      chrome.tabs.sendMessage(tab.id, { type: 'WEBMCP_STATUS' }) as Promise<WebMcpStatus>
    ]);
    render(state, undefined, webMcp);
  } catch { render(unsupportedState()); }
}
void inspect();
