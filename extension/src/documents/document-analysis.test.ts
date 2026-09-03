import { describe, expect, it } from 'vitest';
import { emptyAcademicState, type Course, type DocumentReference } from '@academic/core';
import { DocumentAnalyzer, processDocuments, type CacheEntry, type DocumentCache } from './analyzer';
import { extractDocumentFacts } from './fact-extractor';
import { mergeAcademicStates } from '../semester/collector';

const observedAt = '2026-09-02T12:00:00.000Z';
const course: Course = {
  id: 'course-1', courseCode: 'CSE 331', courseTitle: 'Algorithms', sourcePlatform: 'ub-brightspace',
  sourceUrl: 'https://ublearns.buffalo.edu/d2l/home/123', lastObservedAt: observedAt
};
function source(title = 'Course Syllabus', documentType: DocumentReference['documentType'] = 'syllabus'): DocumentReference {
  return {
    id: 'document-' + title, courseId: course.id, courseCode: course.courseCode, title, documentType,
    mimeType: 'application/pdf', textExtractionStatus: 'pending', sourcePlatform: 'ub-brightspace',
    sourceUrl: 'https://ublearns.buffalo.edu/d2l/le/content/123/' + encodeURIComponent(title) + '.pdf',
    sourceTitle: title, sourceType: documentType, extractedFrom: 'visible-dom', lastObservedAt: observedAt
  };
}
class MemoryCache implements DocumentCache {
  values = new Map<string, CacheEntry>();
  async get(key: string): Promise<CacheEntry | undefined> { return this.values.get(key); }
  async set(key: string, value: CacheEntry): Promise<void> { this.values.set(key, value); }
}

describe('document fact extraction', () => {
  it('extracts deadlines, exam dates, grading, attendance, office hours, meetings, and provenance', () => {
    const state = extractDocumentFacts([
      'Homework 4 due September 9, 2026 at 11:59 PM',
      'Midterm Exam: September 18, 2026 at 2:00 PM',
      'Homework grades: 30%',
      'Attendance is required; two absences are allowed.',
      'Office Hours: Tuesday 2:00-4:00 PM, Davis 347',
      'Lectures meet Mon/Wed 10:00-11:20, Knox 20'
    ].join('\n'), source(), course);
    expect(state.assignments[0]?.dueAt).toBe('2026-09-09T23:59:00');
    expect(state.exams[0]?.startsAt).toBe('2026-09-18T14:00:00');
    expect(state.policies.map((item) => item.policyType)).toEqual(['grading', 'attendance']);
    expect(state.officeHours[0]?.scheduleText).toContain('Tuesday');
    expect(state.classMeetings[0]?.meetingPattern).toContain('Mon/Wed');
    expect(state.assignments[0]?.sourceReference).toMatchObject({ sourceTitle: 'Course Syllabus', extractedFrom: 'document-text' });
  });

  it('ignores malformed dates instead of inventing values', () => {
    const state = extractDocumentFacts('Homework 4 due Someday 99, 2026', source(), course);
    expect(state.assignments).toEqual([]);
  });

  it('keeps both conflicting due dates and emits an explicit conflict', () => {
    const first = extractDocumentFacts('Homework 4 due September 9, 2026', source('Course Syllabus'), course);
    const second = extractDocumentFacts('Homework 4 due September 10, 2026', source('Homework 4 Assignment', 'assignment'), course);
    const merged = mergeAcademicStates(first, second);
    expect(merged.assignments).toHaveLength(2);
    expect(merged.conflicts[0]).toMatchObject({ type: 'DUE_DATE_CONFLICT', entityTitle: 'Homework 4' });
    expect(merged.conflicts[0]?.values).toHaveLength(2);
  });
});

describe('bounded PDF analysis and cache', () => {
  it('handles image-only PDFs without crashing', async () => {
    const analyzer = new DocumentAnalyzer(new MemoryCache(), async () => ({ bytes: new ArrayBuffer(1), contentType: 'application/pdf', signal: 'v1' }),
      async () => ({ status: 'unsupported_image_pdf', text: '', pagesProcessed: 1, totalPages: 1, truncated: false }));
    const state = await analyzer.analyze(source(), course);
    expect(state.documents[0]?.textExtractionStatus).toBe('unsupported_image_pdf');
  });

  it('reuses cached normalized facts for an unchanged document', async () => {
    let extractions = 0;
    const analyzer = new DocumentAnalyzer(new MemoryCache(), async () => ({ bytes: new ArrayBuffer(1), contentType: 'application/pdf', signal: 'v1' }),
      async () => { extractions += 1; return { status: 'complete', text: 'Homework 4 due September 9, 2026', pagesProcessed: 1, totalPages: 1, truncated: false }; });
    await analyzer.analyze(source(), course);
    const second = await analyzer.analyze(source(), course);
    expect(extractions).toBe(1);
    expect(second.documents[0]?.textExtractionStatus).toBe('cached');
  });

  it('enforces the ten-document per-course limit and marks partial', async () => {
    const analyzer = { analyze: async (document: DocumentReference) => {
      const state = emptyAcademicState('ub-brightspace', new URL(document.sourceUrl), observedAt);
      state.documents.push({ ...document, textExtractionStatus: 'complete' });
      return state;
    } };
    const documents = Array.from({ length: 11 }, (_, index) => source('Assignment ' + index, 'assignment'));
    const result = await processDocuments(documents, course, analyzer);
    expect(result.state.documents).toHaveLength(10);
    expect(result.partial).toBe(true);
  });
});
