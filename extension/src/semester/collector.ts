import {
  deduplicateById, stableId, toDiscoveredCourses,
  type AcademicState, type Assignment, type SemesterScanState, type SourceReference
} from '@academic/core';

export interface CollectedPage { state: AcademicState; targets: string[]; partial?: boolean; }
export interface PageCollector { collect(url: string): Promise<CollectedPage>; }
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
  constructor(private readonly pages: PageCollector, private readonly maximumTargetsPerCourse = 6) {}
  async scan(homeState: AcademicState, onProgress: ScanProgressListener = () => undefined): Promise<SemesterScanState> {
    const discovered = toDiscoveredCourses(homeState.courses);
    const scan: SemesterScanState = { status: 'discovering', courses: discovered.map((course) => ({ ...course, status: 'pending' })), academicState: { ...homeState } };
    onProgress(snapshot(scan));
    if (scan.courses.length === 0) { scan.status = 'complete'; onProgress(snapshot(scan)); return scan; }
    scan.status = 'scanning'; onProgress(snapshot(scan));
    for (const course of scan.courses) {
      course.status = 'scanning'; onProgress(snapshot(scan));
      let hadPartialFailure = false;
      try {
        const coursePage = await this.pages.collect(course.courseUrl);
        scan.academicState = mergeAcademicStates(scan.academicState, coursePage.state);
        hadPartialFailure ||= coursePage.partial === true;
        const targets = [...new Set(coursePage.targets)].slice(0, this.maximumTargetsPerCourse);
        for (const target of targets) {
          try {
            const page = await this.pages.collect(target);
            scan.academicState = mergeAcademicStates(scan.academicState, page.state);
            hadPartialFailure ||= page.partial === true;
          } catch { hadPartialFailure = true; }
        }
        course.status = hadPartialFailure ? 'partial' : 'complete';
      } catch {
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


