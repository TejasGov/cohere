import type { AcademicState, Course } from './schema';

export type SemesterScanStatus = 'idle' | 'discovering' | 'scanning' | 'complete' | 'partial' | 'error';
export type CourseScanStatus = 'pending' | 'scanning' | 'complete' | 'partial' | 'failed';

export interface DiscoveredCourse {
  id: string;
  orgUnitId?: string;
  courseCode?: string;
  courseTitle?: string;
  courseUrl: string;
  term?: string;
}

export interface CourseScanRecord extends DiscoveredCourse {
  discoveryCandidates?: Array<{ title: string; sourceUrl: string; discoveryPage: string; classificationResult: string }>;
  documentDiagnostics?: {
    courseHomeVisited: boolean;
    contentEntryFound: boolean;
    contentEntryUrl?: string;
    modulesVisited: number;
    topicsVisited: number;
    coursePagesVisited: number;
    contentPagesVisited: number;
    documentLinksFound: number;
    targetDocumentsClassified: number;
    documentsFetched: number;
    textExtractionsSucceeded: number;
    pdfTextExtractionsSucceeded: number;
    htmlDocumentExtractionsSucceeded: number;
    documentsWithFacts: number;
    factsExtracted: number;
    documentsFailed: number;
  };
  navigationSteps?: Array<{
    pageType: 'course-home' | 'content-entry' | 'module' | 'topic' | 'assignment' | 'assessment';
    safeUrl: string;
    title?: string;
    result: 'discovered' | 'visited' | 'failed' | 'ignored-limit';
    failureReason?: string;
  }>;
  status: CourseScanStatus;
  error?: string;
}

export interface SemesterScanState {
  status: SemesterScanStatus;
  courses: CourseScanRecord[];
  academicState: AcademicState;
}

export function toDiscoveredCourses(courses: readonly Course[]): DiscoveredCourse[] {
  const seen = new Set<string>();
  return courses.flatMap((course) => {
    if (seen.has(course.id)) return [];
    let parsed: URL;
    try {
      parsed = new URL(course.sourceUrl);
    } catch {
      return [];
    }
    if (parsed.hostname !== 'ublearns.buffalo.edu' || !/^\/d2l\/home\/\d+\/?$/i.test(parsed.pathname)) return [];
    seen.add(course.id);
    return [{
      id: course.id,
      orgUnitId: course.sourceId,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      courseUrl: parsed.origin + parsed.pathname,
      term: course.term
    }];
  });
}
