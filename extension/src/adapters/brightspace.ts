import {
  cleanText, deduplicateById, emptyAcademicState, stableId,
  type AcademicAdapter, type Announcement, type Assignment, type Course, type Exam
} from '@academic/core';
import { directText, parseAcademicDate, parsePoints } from './common';

export class BrightspaceAdapter implements AcademicAdapter {
  readonly id = 'brightspace' as const;

  canHandle(document: Document): boolean {
    return document.querySelector('[data-demo-platform="brightspace"]') !== null;
  }

  extract(document: Document, url: URL) {
    const observedAt = new Date().toISOString();
    const state = emptyAcademicState(this.id, url, observedAt);
    const courses: Course[] = [];
    const assignments: Assignment[] = [];
    const exams: Exam[] = [];
    const announcements: Announcement[] = [];

    document.querySelectorAll<HTMLElement>('[data-demo-platform="brightspace"]').forEach((root) => {
      const codeElement = root.querySelector<HTMLElement>('[data-course-code]');
      const courseCode = cleanText(codeElement?.dataset.courseCode ?? codeElement?.textContent);
      const courseTitle = directText(root, '[data-course-title]');
      const instructor = directText(root, '[data-instructor]');
      if (!courseCode && !courseTitle) return;
      const courseId = stableId(this.id, 'course', courseCode, courseTitle);
      const reference = { sourcePlatform: this.id, sourceUrl: url.href, lastObservedAt: observedAt } as const;
      courses.push({ id: courseId, ...reference, courseCode, courseTitle, instructor, status: 'active' });

      root.querySelectorAll<HTMLElement>('[data-academic-item="assignment"]').forEach((item) => {
        const title = directText(item, 'h3');
        if (!title) return;
        assignments.push({
          id: stableId(this.id, 'assignment', courseId, title), ...reference, courseId, courseCode, courseTitle,
          title, description: directText(item, 'p'), dueAt: parseAcademicDate(directText(item, 'time')),
          pointsPossible: parsePoints(item.dataset.points ?? item.textContent), status: 'published'
        });
      });

      root.querySelectorAll<HTMLElement>('[data-academic-item="assessment"]').forEach((item) => {
        const title = directText(item, 'h3');
        if (!title) return;
        exams.push({
          id: stableId(this.id, 'exam', courseId, title), ...reference, courseId, courseCode, courseTitle,
          title, startsAt: parseAcademicDate(directText(item, 'time')), pointsPossible: parsePoints(item.dataset.points ?? item.textContent),
          status: 'scheduled'
        });
      });

      root.querySelectorAll<HTMLElement>('[data-academic-item="announcement"]').forEach((item) => {
        const title = directText(item, 'h2') ?? directText(item, 'h3');
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
