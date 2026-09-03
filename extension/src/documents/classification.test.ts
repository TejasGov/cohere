import { describe, expect, it } from 'vitest';
import { classifyDocumentTitle, discoverTargetDocuments } from './classification';
import type { Course } from '@academic/core';

const course: Course = {
  id: 'course-1', courseCode: 'CSE 331', courseTitle: 'Algorithms', sourcePlatform: 'ub-brightspace',
  sourceUrl: 'https://ublearns.buffalo.edu/d2l/home/123', lastObservedAt: '2026-09-02T12:00:00.000Z'
};

describe('target document classification', () => {
  it.each([
    ['Fall 2026 Course Syllabus', 'syllabus'],
    ['Final Exam Schedule', 'exam-schedule'],
    ['Homework 4 Assignment', 'assignment'],
    ['Attendance Policy', 'course-policy'],
    ['Policies', 'course-policy'],
    ['Course Information', 'course-policy']
  ])('classifies strong title %s', (title, expected) => expect(classifyDocumentTitle(title)).toBe(expected));

  it.each(['Lecture 1 Slides', 'Weekly Reading', 'Module Overview', 'Recording', 'Resources'])(
    'ignores broad course content %s', (title) => expect(classifyDocumentTitle(title)).toBeUndefined()
  );

  it('discovers only same-origin authorized targets and deduplicates URLs', () => {
    document.body.innerHTML = '<a href="/d2l/le/content/123/topics/files/download/7/directFileTopicDownload">Course Syllabus</a>' +
      '<a href="/d2l/le/content/123/topics/files/download/7/directFileTopicDownload">Syllabus copy</a>' +
      '<a href="https://example.com/evil.pdf">Exam Schedule</a>';
    const documents = discoverTargetDocuments(document, new URL(course.sourceUrl), course);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ documentType: 'syllabus', courseId: 'course-1' });
  });
});

