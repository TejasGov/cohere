import type { AcademicState, SemesterScanState, SourcePlatform } from '@academic/core';
import { ChromePageCollector } from './semester/chrome-page-collector';
import { SemesterCollector, mergeAcademicStates } from './semester/collector';
import { sendMessageToFrames } from './frame-messaging';
import { mergeCourseDiscoveryReports, type ClickObservation, type CourseDiscoveryReport, type CourseInspectorResponse } from './course-discovery-inspector';
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
let currentInspectorReport: CourseDiscoveryReport | undefined;
let currentInspectorError: string | undefined;

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
  const frameDiscovery = state.diagnostics?.frameCourseDiscovery ?? [];
  const routeCandidates = frameDiscovery.reduce((sum, frame) => sum + frame.candidateCourseLinks, 0);
  const cardCandidates = frameDiscovery.reduce((sum, frame) => sum + (frame.candidateCourseHosts ?? 0), 0);
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
      <p>Courses discovered: ${scan?.courses.length ?? state.courses.length}<br>Courses scanned: ${scanned}/${scan?.courses.length ?? state.courses.length}${state.courses.length === 0 ? `<br>Frames inspected: ${state.diagnostics?.framesInspected ?? 1}<br>Course route candidates: ${routeCandidates}<br>Course card hosts: ${cardCandidates}` : ''}</p>
      <ol class="scan-courses"></ol>
      <button id="scan-semester" type="button" ${scanActive ? 'disabled' : ''}>${scanActive ? 'Scanning…' : 'Scan academic semester'}</button>
    </section>
    <section class="course-inspector">
      <h2>Real course discovery inspector <small>v2</small></h2>
      <button id="inspect-courses" type="button">Inspect real course discovery</button>
      <button id="observe-course-click" type="button">Observe next course-card click</button>
      <button id="copy-course-diagnostics" type="button" ${currentInspectorReport ? '' : 'disabled'}>Copy sanitized diagnostics</button>
      <p class="inspector-summary">${currentInspectorError ?? ''}</p>
      <details ${currentInspectorReport ? 'open' : ''}><summary>Sanitized structural report</summary><pre class="course-inspector-report"></pre></details>
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
    <details><summary>Developer: document pipeline</summary><pre class="document-pipeline"></pre></details>
    <details><summary>Developer: normalized JSON</summary><pre class="academic-debug"></pre></details>
    <footer>Academic information is processed locally in your browser.</footer>`;
  const platform = app.querySelector<HTMLElement>('.platform strong');
  if (platform) platform.textContent = `${labels[state.sourcePlatform]}${detected ? ' detected' : ''}`;
  const academicDebug = app.querySelector<HTMLElement>('.academic-debug');
  if (academicDebug) academicDebug.textContent = JSON.stringify(state, null, 2);
  const inspectorSummary = app.querySelector<HTMLElement>('.inspector-summary');
  if (inspectorSummary && currentInspectorReport) inspectorSummary.textContent = `My Courses: ${currentInspectorReport.myCoursesContainerFound ? 'found' : 'not found'} · Custom elements: ${currentInspectorReport.customElements.length} · Accessible shadows: ${currentInspectorReport.accessibleShadowRoots} · Iframes: ${currentInspectorReport.iframes.length} · Clickables: ${currentInspectorReport.clickableCandidates.length} · Course-like text: ${currentInspectorReport.courseLikeTextCandidates} · Course hrefs: ${currentInspectorReport.courseLinkHrefs} · Org-unit-like IDs: ${currentInspectorReport.orgUnitLikeIdsFound} · Strategy: ${currentInspectorReport.likelyDiscoveryStrategy}`;
  const inspectorOutput = app.querySelector<HTMLElement>('.course-inspector-report');
  if (inspectorOutput) inspectorOutput.textContent = currentInspectorReport ? JSON.stringify(currentInspectorReport, null, 2) : 'Run the inspector after My Courses finishes rendering.';
  const webMcpTools = app.querySelector<HTMLUListElement>('.webmcp-tools');
  webMcp.expectedTools.forEach((name) => {
    const item = document.createElement('li');
    item.textContent = `${name} — ${webMcp.registeredTools.includes(name) ? 'registered' : 'not registered'}`;
    webMcpTools?.append(item);
  });
  const webMcpDebug = app.querySelector<HTMLElement>('.webmcp-debug');
  if (webMcpDebug) webMcpDebug.textContent = JSON.stringify(webMcp, null, 2);
  const sources = app.querySelector<HTMLUListElement>('.sources ul');
  const pipeline = app.querySelector<HTMLElement>('.document-pipeline');
  if (pipeline) pipeline.textContent = JSON.stringify({
    stages: 'DISCOVERED → CLASSIFIED → FETCHED → TEXT EXTRACTED → FACTS EXTRACTED',
    homepageExtraction: state.diagnostics,
    courses: scan?.courses.map((course) => ({ courseCode: course.courseCode, ...course.documentDiagnostics, navigationSteps: course.navigationSteps, discoveryCandidates: course.discoveryCandidates })) ?? [],
    documents: state.documents.map((item) => ({ title: item.title, documentType: item.documentType, sourceUrl: item.sourceUrl, ...item.processing }))
  }, null, 2);
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
    const diagnostic = course.documentDiagnostics;
    item.textContent = diagnostic ? `${name}  ${courseStatusLabel(course.status)}\nCourse home visited: ${diagnostic.courseHomeVisited ? 'yes' : 'no'}\nContent entry found: ${diagnostic.contentEntryFound ? 'yes' : 'no'}${diagnostic.contentEntryUrl ? `\nContent entry URL: ${diagnostic.contentEntryUrl}` : ''}\nModules visited: ${diagnostic.modulesVisited}\nTopics visited: ${diagnostic.topicsVisited}\nDocument links found: ${diagnostic.documentLinksFound}\nTarget documents: ${diagnostic.targetDocumentsClassified}\nFetched: ${diagnostic.documentsFetched}\nText extracted: ${diagnostic.textExtractionsSucceeded}\nFacts: ${diagnostic.factsExtracted}` : `${name}  ${courseStatusLabel(course.status)}`;
    item.style.whiteSpace = 'pre-line';
    courseList?.append(item);
  });
  app.querySelector<HTMLButtonElement>('#scan-semester')?.addEventListener('click', () => void startSemesterScan());
  app.querySelector<HTMLButtonElement>('#inspect-courses')?.addEventListener('click', () => void inspectRealCourseDiscovery());
  app.querySelector<HTMLButtonElement>('#observe-course-click')?.addEventListener('click', () => void observeCourseClick());
  app.querySelector<HTMLButtonElement>('#copy-course-diagnostics')?.addEventListener('click', () => void copyCourseDiagnostics());
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function inspectRealCourseDiscovery(): Promise<void> {
  const tabId = await activeTabId(); if (tabId === undefined) return;
  await chrome.storage.local.remove('academicCourseClickObservation');
  const responses = await sendMessageToFrames<CourseInspectorResponse>(tabId, { type: 'INSPECT_COURSE_DISCOVERY' });
  const reports = responses.flatMap((response) => response.ok ? [response.report] : []);
  const failures = responses.flatMap((response) => response.ok ? [] : [`${response.framePath}: ${response.error}`]);
  currentInspectorReport = mergeCourseDiscoveryReports(reports);
  currentInspectorError = currentInspectorReport ? undefined : failures.length ? `Inspector failed — ${failures.join('; ')}` : 'Inspector failed — no authorized frame responded. Refresh the UB page after reloading the extension.';
  if (currentInspectorReport) await chrome.storage.local.set({ academicCourseDiscoveryReport: currentInspectorReport });
  render(currentState, currentScan);
}

async function observeCourseClick(): Promise<void> {
  const tabId = await activeTabId(); if (tabId === undefined) return;
  await sendMessageToFrames(tabId, { type: 'OBSERVE_COURSE_CLICK' });
  const stored = await chrome.storage.local.get('academicCourseClickObservation');
  if (currentInspectorReport) currentInspectorReport = { ...currentInspectorReport, clickObservation: stored.academicCourseClickObservation as ClickObservation | undefined };
  render(currentState, currentScan);
}

async function copyCourseDiagnostics(): Promise<void> {
  if (!currentInspectorReport) return;
  await navigator.clipboard.writeText(JSON.stringify(currentInspectorReport, null, 2));
  const summary = app.querySelector<HTMLElement>('.inspector-summary');
  if (summary) summary.textContent = 'Sanitized diagnostics copied.';
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
    const [states, webMcp, storedInspector] = await Promise.all([
      sendMessageToFrames<AcademicState>(tab.id, { type: 'ACADEMIC_STATE' }),
      chrome.tabs.sendMessage(tab.id, { type: 'WEBMCP_STATUS' }, { frameId: 0 }) as Promise<WebMcpStatus>,
      chrome.storage.local.get(['academicCourseDiscoveryReport', 'academicCourseClickObservation'])
    ]);
    const state = states.reduce((merged, incoming) => merged ? mergeAcademicStates(merged, incoming) : incoming, undefined as AcademicState | undefined);
    if (!state) throw new Error('No academic frame responded');
    state.diagnostics = {
      ...(state.diagnostics ?? { adapterSelected: state.sourcePlatform, hostname: '', pathname: '', candidateCourseLinks: 0, candidateHrefPatterns: [], potentialCourseCardContainers: 0 }),
      framesInspected: states.length,
      frameCourseDiscovery: states.map((frame) => ({
        pathname: frame.diagnostics?.pathname ?? new URL(frame.sourceUrl || location.href).pathname,
        candidateCourseLinks: frame.diagnostics?.candidateCourseLinks ?? 0,
        candidateCourseHosts: frame.diagnostics?.candidateCourseHosts,
        coursesExtracted: frame.courses.length
      }))
    };
    const savedReport = storedInspector.academicCourseDiscoveryReport as CourseDiscoveryReport | undefined;
    currentInspectorReport = savedReport?.reportVersion === 2 ? { ...savedReport, clickObservation: storedInspector.academicCourseClickObservation as ClickObservation | undefined } : undefined;
    if (savedReport && savedReport.reportVersion !== 2) void chrome.storage.local.remove(['academicCourseDiscoveryReport', 'academicCourseClickObservation']);
    render(state, undefined, webMcp);
  } catch { render(unsupportedState()); }
}
void inspect();
