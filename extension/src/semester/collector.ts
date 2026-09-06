import {
  deduplicateById, stableId, toDiscoveredCourses,
  type AcademicState, type Assignment, type Course, type CourseScanRecord, type SemesterScanState, type SourceReference
} from '@academic/core';
import type { AcademicNavigationTarget } from './page-discovery';

export interface CollectedPage { state: AcademicState; targets: string[]; navigationTargets?: AcademicNavigationTarget[]; partial?: boolean; discoveryCandidates?: CourseScanRecord['discoveryCandidates']; }
export interface PageCollector { collect(url: string, course?: Course): Promise<CollectedPage>; }
export type ScanProgressListener = (state: SemesterScanState) => void;

function entitySource(entity: Assignment): SourceReference {
  return entity.sourceReference ?? {
    sourcePlatform: entity.sourcePlatform, sourceUrl: entity.sourceUrl,
    sourceTitle: entity.sourceTitle ?? entity.title, sourceType: entity.sourceType,
    extractedFrom: entity.extractedFrom, lastObservedAt: entity.lastObservedAt
  };
}

function mergeAcademicStates(target: AcademicState, incoming: AcademicState): AcademicState {
  const allAssignments = [...target.assignments, ...incoming.assignments];
  const conflicts = [...target.conflicts, ...incoming.conflicts];
  for (let index = 0; index < allAssignments.length; index += 1) {
    for (let other = index + 1; other < allAssignments.length; other += 1) {
      const left = allAssignments[index];
      const right = allAssignments[other];
      if (!left || !right || !left.dueAt || !right.dueAt || left.dueAt === right.dueAt) continue;
      if (left.courseId !== right.courseId || left.title.trim().toLowerCase() !== right.title.trim().toLowerCase()) continue;
      conflicts.push({
        id: stableId('due-conflict', left.courseId, left.title, ...[left.dueAt, right.dueAt].sort()),
        type: 'DUE_DATE_CONFLICT', courseId: left.courseId, courseCode: left.courseCode ?? right.courseCode,
        entityTitle: left.title, sources: [entitySource(left), entitySource(right)],
        values: [{ value: left.dueAt, source: entitySource(left) }, { value: right.dueAt, source: entitySource(right) }],
        detectedAt: incoming.lastObservedAt
      });
    }
  }
  return {
    ...target,
    lastObservedAt: incoming.lastObservedAt,
    courses: deduplicateById([...target.courses, ...incoming.courses]),
    assignments: deduplicateById(allAssignments),
    exams: deduplicateById([...target.exams, ...incoming.exams]),
    announcements: deduplicateById([...target.announcements, ...incoming.announcements]),
    classMeetings: deduplicateById([...target.classMeetings, ...incoming.classMeetings]),
    documents: deduplicateById([...target.documents, ...incoming.documents]),
    policies: deduplicateById([...target.policies, ...incoming.policies]),
    officeHours: deduplicateById([...target.officeHours, ...incoming.officeHours]),
    conflicts: deduplicateById(conflicts)
  };
}

function snapshot(state: SemesterScanState): SemesterScanState {
  return { ...state, courses: state.courses.map((course) => ({ ...course })), academicState: { ...state.academicState } };
}

export class SemesterCollector {
  constructor(private readonly pages: PageCollector, private readonly maximumContentPagesPerCourse = 8) {}
  async scan(homeState: AcademicState, onProgress: ScanProgressListener = () => undefined): Promise<SemesterScanState> {
    const discovered = toDiscoveredCourses(homeState.courses);
    const scan: SemesterScanState = { status: 'discovering', courses: discovered.map((course) => ({ ...course, status: 'pending' })), academicState: { ...homeState } };
    onProgress(snapshot(scan));
    if (scan.courses.length === 0) { scan.status = 'complete'; onProgress(snapshot(scan)); return scan; }
    scan.status = 'scanning'; onProgress(snapshot(scan));
    for (const course of scan.courses) {
      course.status = 'scanning'; onProgress(snapshot(scan));
      let hadPartialFailure = false;
      const diagnostics: NonNullable<CourseScanRecord['documentDiagnostics']> = course.documentDiagnostics = {
        courseHomeVisited: false, contentEntryFound: false, modulesVisited: 0, topicsVisited: 0,
        coursePagesVisited: 0, contentPagesVisited: 0, documentLinksFound: 0, targetDocumentsClassified: 0,
        documentsFetched: 0, textExtractionsSucceeded: 0, pdfTextExtractionsSucceeded: 0,
        htmlDocumentExtractionsSucceeded: 0, documentsWithFacts: 0, factsExtracted: 0, documentsFailed: 0
      };
      course.navigationSteps = [];
      const steps: NonNullable<CourseScanRecord['navigationSteps']> = course.navigationSteps;
      try {
        const context = homeState.courses.find((item) => item.id === course.id);
        const coursePage = await this.pages.collect(course.courseUrl, context);
        diagnostics.courseHomeVisited = true;
        diagnostics.coursePagesVisited = 1;
        steps.push({ pageType: 'course-home', safeUrl: course.courseUrl, title: course.courseCode ?? course.courseTitle, result: 'visited' });
        scan.academicState = mergeAcademicStates(scan.academicState, coursePage.state);
        hadPartialFailure ||= coursePage.partial === true;
        const candidateMap = new Map<string, NonNullable<CourseScanRecord['discoveryCandidates']>[number]>();
        const observe = (page: CollectedPage): void => {
          for (const candidate of page.discoveryCandidates ?? []) candidateMap.set(candidate.sourceUrl, candidate);
          course.discoveryCandidates = [...candidateMap.values()];
          diagnostics.documentLinksFound = candidateMap.size;
          diagnostics.targetDocumentsClassified = [...candidateMap.values()].filter((item) => item.classificationResult !== 'ignored_non_target').length;
        };
        observe(coursePage);
        const summarize = (state: AcademicState): void => {
          for (const document of state.documents) {
            const p = document.processing;
            if (p?.fetchStatus === 'success') diagnostics.documentsFetched += 1;
            if (p?.extractionStatus === 'pdf_success') { diagnostics.pdfTextExtractionsSucceeded += 1; diagnostics.textExtractionsSucceeded += 1; }
            if (p?.extractionStatus === 'html_success') { diagnostics.htmlDocumentExtractionsSucceeded += 1; diagnostics.textExtractionsSucceeded += 1; }
            if (p?.factCount) diagnostics.documentsWithFacts += 1;
            diagnostics.factsExtracted += p?.factCount ?? 0;
            if (document.textExtractionStatus === 'failed') diagnostics.documentsFailed += 1;
          }
        };
        summarize(coursePage.state);
        const initialNavigation = coursePage.navigationTargets ?? [...new Set(coursePage.targets)].map((url) => ({ url, pageType: 'content-entry' as const, label: 'Content' }));
        const entry = initialNavigation.find((target) => target.pageType === 'content-entry');
        diagnostics.contentEntryFound = entry !== undefined;
        diagnostics.contentEntryUrl = entry?.url;
        const targets = entry ? [{ ...entry, depth: coursePage.navigationTargets ? 0 : 1 }] : [];
        if (entry) steps.push({ pageType: entry.pageType, safeUrl: entry.url, title: entry.label, result: 'discovered' });
        const visited = new Set([course.courseUrl]);
        let contentPages = 0;
        for (const target of targets) {
          if (visited.has(target.url)) continue;
          const content = new URL(target.url).pathname.includes('/le/content/');
          if (content && contentPages >= this.maximumContentPagesPerCourse) {
            hadPartialFailure = true;
            steps.push({ pageType: target.pageType, safeUrl: target.url, title: target.label, result: 'ignored-limit', failureReason: 'content_page_limit' });
            continue;
          }
          visited.add(target.url);
          if (content) contentPages += 1;
          try {
            const page = await this.pages.collect(target.url, context);
            steps.push({ pageType: target.pageType, safeUrl: target.url, title: target.label, result: 'visited' });
            observe(page);
            if (content) diagnostics.contentPagesVisited += 1; else diagnostics.coursePagesVisited += 1;
            if (target.pageType === 'module') diagnostics.modulesVisited += 1;
            if (target.pageType === 'topic') diagnostics.topicsVisited += 1;
            summarize(page.state);
            scan.academicState = mergeAcademicStates(scan.academicState, page.state);
            hadPartialFailure ||= page.partial === true;
            const fallbackType = target.pageType === 'content-entry' ? 'module' : 'topic';
            const children = (page.navigationTargets ?? page.targets.map((url) => ({ url, pageType: fallbackType, label: fallbackType === 'module' ? 'Module' : 'Topic' })))
              .filter((child) => !visited.has(child.url) && new URL(child.url).pathname.includes('/le/content/'));
            if (target.depth < 2) {
              for (const child of children) {
                if (!targets.some((item) => item.url === child.url)) {
                  targets.push({ ...child, depth: target.depth + 1 });
                  steps.push({ pageType: child.pageType, safeUrl: child.url, title: child.label, result: 'discovered' });
                }
              }
            } else if (children.length) hadPartialFailure = true;
          } catch {
            hadPartialFailure = true;
            steps.push({ pageType: target.pageType, safeUrl: target.url, title: target.label, result: 'failed', failureReason: 'page_collection_failed' });
          }
        }
        course.status = hadPartialFailure ? 'partial' : 'complete';
      } catch {
        steps.push({ pageType: 'course-home', safeUrl: course.courseUrl, title: course.courseCode ?? course.courseTitle, result: 'failed', failureReason: 'page_collection_failed' });
        course.status = 'failed'; course.error = 'Page could not be collected';
      }
      onProgress(snapshot(scan));
    }
    scan.status = scan.courses.some((course) => course.status !== 'complete') ? 'partial' : 'complete';
    onProgress(snapshot(scan));
    return scan;
  }
}
export { mergeAcademicStates };


