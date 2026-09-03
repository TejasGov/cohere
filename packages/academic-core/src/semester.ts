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
