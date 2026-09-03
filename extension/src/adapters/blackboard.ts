import {
  cleanText, deduplicateById, emptyAcademicState, stableId,
  type AcademicAdapter, type Announcement, type Assignment, type Course, type Exam
} from '@academic/core';
import { directText, parseAcademicDate, parsePoints } from './common';

function parseCourseLabel(value: string | undefined): { courseCode?: string; courseTitle?: string } {
  if (!value) return {};
  const [rawCode, ...titleParts] = value.split(/\s+[—–-]\s+/);
  const courseCode = /^\p{L}{2,5}\s*\d{2,4}[A-Z]?$/u.test(rawCode?.trim() ?? '') ? cleanText(rawCode) : undefined;
  const courseTitle = cleanText(titleParts.join(' — ')) ?? (courseCode ? undefined : value);
  return { courseCode, courseTitle };
}

export class BlackboardAdapter implements AcademicAdapter {
  readonly id = 'blackboard' as const;

  canHandle(document: Document): boolean {
    return document.querySelector('#blackboard-app, .blackboard') !== null;
  }

  extract(document: Document, url: URL) {
    const observedAt = new Date().toISOString();
    const state = emptyAcademicState(this.id, url, observedAt);
    const courses: Course[] = [];
    const assignments: Assignment[] = [];
    const exams: Exam[] = [];
    const announcements: Announcement[] = [];
    const roots = document.querySelectorAll<HTMLElement>('.blackboard');

    roots.forEach((root) => {
      const labelElement = root.querySelector<HTMLElement>('[data-bb-course]');
      const label = cleanText(labelElement?.textContent);
      const { courseCode, courseTitle } = parseCourseLabel(label);
      if (!courseCode && !courseTitle) return;
      const courseId = stableId(this.id, 'course', courseCode, courseTitle);
      const instructor = directText(root, '.instructor-line strong');
      const reference = { sourcePlatform: this.id, sourceUrl: url.href, lastObservedAt: observedAt } as const;
      courses.push({ id: courseId, ...reference, courseCode, courseTitle, instructor, status: 'active' });

      root.querySelectorAll<HTMLElement>('.content-item.assignment').forEach((item) => {
        const title = directText(item, 'h2');
        if (!title) return;
        assignments.push({
          id: stableId(this.id, 'assignment', courseId, title), ...reference, courseId, courseCode, courseTitle,
          title, description: directText(item, '.description'), dueAt: parseAcademicDate(directText(item, '.date-line')),
          pointsPossible: parsePoints(item.dataset.points ?? item.textContent), status: 'published'
        });
      });

      root.querySelectorAll<HTMLElement>('.content-item.exam').forEach((item) => {
        const title = directText(item, 'h2');
        if (!title) return;
        exams.push({
          id: stableId(this.id, 'exam', courseId, title), ...reference, courseId, courseCode, courseTitle,
          title, description: directText(item, '.description'), startsAt: parseAcademicDate(directText(item, '.date-line')),
          location: directText(item, '.location'), pointsPossible: parsePoints(item.dataset.points ?? item.textContent), status: 'scheduled'
        });
      });

      root.querySelectorAll<HTMLElement>('.content-item.notice').forEach((item) => {
        const title = directText(item, 'h2');
        if (!title) return;
        announcements.push({
          id: stableId(this.id, 'announcement', courseId, title), ...reference, courseId, courseCode, courseTitle,
          title, description: directText(item, 'p'), status: 'published'
        });
      });
    });

    state.courses = deduplicateById(courses);
    state.assignments = deduplicateById(assignments);
    state.exams = deduplicateById(exams);
    state.announcements = deduplicateById(announcements);
    return state;
  }
}
