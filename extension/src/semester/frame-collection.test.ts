import { describe, expect, it } from 'vitest';
import { emptyAcademicState, stableId, type Course, type DocumentReference } from '@academic/core';
import { mergePageResponses, type PageResponse } from './chrome-page-collector';

const observedAt = '2026-09-05T12:00:00.000Z';
const course: Course = {
  id: stableId('ub-brightspace', 'course', '21099'), sourceId: '21099', sourcePlatform: 'ub-brightspace',
  sourceUrl: 'https://ublearns.buffalo.edu/d2l/home/21099', lastObservedAt: observedAt,
  courseCode: 'CSE 341LR A', courseTitle: 'Computer Organization', status: 'active'
};

function response(sourceUrl: string): PageResponse {
  return { state: emptyAcademicState('ub-brightspace', new URL(sourceUrl), observedAt), targets: [] };
}

describe('frame-aware Brightspace collection', () => {
  it('merges a course from a widget frame with navigation from the top frame', () => {
    const top = response('https://ublearns.buffalo.edu/d2l/home');
    top.navigationTargets = [{ url: course.sourceUrl, pageType: 'content-entry', label: 'Content' }];
    top.targets = [course.sourceUrl];
    const widget = response('https://ublearns.buffalo.edu/d2l/home');
    widget.state.courses = [course];
    const merged = mergePageResponses([top, widget]);
    expect(merged.state.courses).toEqual([course]);
    expect(merged.navigationTargets).toEqual(top.navigationTargets);
  });

  it('deduplicates the same document reported by multiple frames', () => {
    const document: DocumentReference = {
      id: 'doc-1', courseId: course.id, courseCode: course.courseCode, title: 'Syllabus', documentType: 'syllabus',
      sourcePlatform: 'ub-brightspace', sourceUrl: 'https://ublearns.buffalo.edu/d2l/le/content/21099/viewContent/1/View',
      lastObservedAt: observedAt, textExtractionStatus: 'pending'
    };
    const first = response(course.sourceUrl); first.documents = [document];
    const second = response(course.sourceUrl); second.documents = [document];
    expect(mergePageResponses([first, second]).documents).toEqual([document]);
  });

  it('fails explicitly when no authorized frame responds', () => {
    expect(() => mergePageResponses([])).toThrow('No authorized frame responded');
  });
});
