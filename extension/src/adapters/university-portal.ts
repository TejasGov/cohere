import {
  cleanText, deduplicateById, emptyAcademicState, stableId,
  type AcademicAdapter, type ClassMeeting, type Course
} from '@academic/core';
import { parseClockTime } from './common';

export class UniversityPortalAdapter implements AcademicAdapter {
  readonly id = 'university-portal' as const;

  canHandle(document: Document): boolean {
    return document.querySelector('[data-system="student-information-system"]') !== null;
  }

  extract(document: Document, url: URL) {
    const observedAt = new Date().toISOString();
    const state = emptyAcademicState(this.id, url, observedAt);
    const courses: Course[] = [];
    const classMeetings: ClassMeeting[] = [];
    const root = document.querySelector<HTMLElement>('[data-system="student-information-system"]');
    if (!root) return state;
    const term = cleanText(root.querySelector('#current-term')?.textContent);
    const reference = { sourcePlatform: this.id, sourceUrl: url.href, lastObservedAt: observedAt } as const;

    root.querySelectorAll<HTMLTableRowElement>('[data-enrollment-row]').forEach((row) => {
      const subject = cleanText(row.querySelector('.subject')?.textContent);
      const catalog = cleanText(row.querySelector('.catalog')?.textContent);
      const courseCode = cleanText([subject, catalog].filter(Boolean).join(' '));
      const explicitTitle = cleanText(row.querySelector('.course-title')?.textContent);
      if (!courseCode && !explicitTitle) return;
      const cells = row.querySelectorAll<HTMLTableCellElement>('td');
      const meetingText = cleanText(cells[1]?.textContent);
      const meetingMatch = /^(.+?)\s+(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})(?:\s+—\s+CANCELLED)?$/i.exec(meetingText ?? '');
      const meetingPattern = cleanText(meetingMatch?.[1]);
      const startsAt = parseClockTime(meetingMatch?.[2]);
      const endsAt = parseClockTime(meetingMatch?.[3]);
      const location = cleanText(row.querySelector('.room')?.textContent ?? cells[2]?.textContent);
      const instructor = cleanText(cells[3]?.textContent);
      const courseId = stableId(this.id, 'course', courseCode, explicitTitle, term);
      const status = row.classList.contains('cancelled') || /cancelled/i.test(meetingText ?? '') ? 'cancelled' : 'scheduled';
      courses.push({
        id: courseId, ...reference, courseCode, courseTitle: explicitTitle, instructor, term, status: 'active'
      });
      classMeetings.push({
        id: stableId(this.id, 'meeting', courseId, meetingPattern, startsAt, endsAt), ...reference,
        courseId, courseCode, courseTitle: explicitTitle, title: `${courseCode ?? explicitTitle ?? 'Class'} meeting`,
        meetingPattern, startsAt, endsAt, location, instructor, term, status
      });
    });

    state.courses = deduplicateById(courses);
    state.classMeetings = deduplicateById(classMeetings);
    return state;
  }
}
