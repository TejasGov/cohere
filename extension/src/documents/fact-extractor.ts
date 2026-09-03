import {
  emptyAcademicState, stableId,
  type AcademicState, type Course, type DocumentReference, type SourceReference
} from '@academic/core';
import { parseAcademicDate } from '../adapters/common';

const monthDate = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM))?/i;

function provenance(document: DocumentReference): SourceReference {
  return {
    sourcePlatform: document.sourcePlatform, sourceUrl: document.sourceUrl, sourceId: document.sourceId,
    sourceTitle: document.title, sourceType: document.documentType, extractedFrom: 'document-text',
    lastObservedAt: document.lastObservedAt
  };
}

export function extractDocumentFacts(text: string, document: DocumentReference, course: Course): AcademicState {
  const state = emptyAcademicState('ub-brightspace', new URL(document.sourceUrl), document.lastObservedAt);
  state.documents.push({ ...document, textExtractionStatus: 'complete' });
  const sourceReference = provenance(document);
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const line of lines) {
    const dateText = line.match(monthDate)?.[0];
    const date = dateText ? parseAcademicDate(dateText) : undefined;
    if (date && /\b(?:assignment|homework|project|proposal|report|problem set|lab)\b/i.test(line) && /\bdue\b/i.test(line)) {
      const title = line.split(/\bdue\b/i)[0]?.replace(/[:–—-]+$/, '').trim() || 'Assignment milestone';
      state.assignments.push({
        id: stableId('document-assignment', course.id, title, document.sourceUrl), courseId: course.id,
        courseCode: course.courseCode, courseTitle: course.courseTitle, title, dueAt: date,
        sourcePlatform: 'ub-brightspace', sourceUrl: document.sourceUrl, sourceTitle: document.title,
        sourceType: document.documentType, extractedFrom: 'document-text', lastObservedAt: document.lastObservedAt,
        sourceReference
      });
    }
    if (date && /\b(?:exam|midterm|final|quiz)\b/i.test(line)) {
      const title = line.replace(monthDate, '').replace(/[:–—-]+$/, '').trim() || 'Exam';
      state.exams.push({
        id: stableId('document-exam', course.id, title, document.sourceUrl), courseId: course.id,
        courseCode: course.courseCode, courseTitle: course.courseTitle, title, startsAt: date,
        sourcePlatform: 'ub-brightspace', sourceUrl: document.sourceUrl, sourceTitle: document.title,
        sourceType: document.documentType, extractedFrom: 'document-text', lastObservedAt: document.lastObservedAt,
        sourceReference
      });
    }
    if (/\b(?:grading|grade|homework|exams?|projects?)\b.*\b\d{1,3}\s*%/i.test(line)) {
      state.policies.push({
        id: stableId('grading-policy', course.id, line, document.sourceUrl), courseId: course.id,
        courseCode: course.courseCode, title: 'Grading policy', policyType: 'grading', description: line,
        sourcePlatform: 'ub-brightspace', sourceUrl: document.sourceUrl, sourceTitle: document.title,
        sourceType: document.documentType, extractedFrom: 'document-text', lastObservedAt: document.lastObservedAt,
        sourceReference
      });
    }
    if (/\battendance\b|\babsences?\b/i.test(line) && /\b(?:required|policy|allowed|penalty|deduct|miss)\b/i.test(line)) {
      state.policies.push({
        id: stableId('attendance-policy', course.id, line, document.sourceUrl), courseId: course.id,
        courseCode: course.courseCode, title: 'Attendance policy', policyType: 'attendance', description: line,
        sourcePlatform: 'ub-brightspace', sourceUrl: document.sourceUrl, sourceTitle: document.title,
        sourceType: document.documentType, extractedFrom: 'document-text', lastObservedAt: document.lastObservedAt,
        sourceReference
      });
    }
    const office = line.match(/office\s+hours?\s*[:–—-]\s*(.+)/i);
    if (office?.[1]) {
      state.officeHours.push({
        id: stableId('office-hours', course.id, office[1], document.sourceUrl), courseId: course.id,
        courseCode: course.courseCode, title: 'Office hours', scheduleText: office[1], location: office[1].match(/,\\s*([^,]+)$/)?.[1],
        sourcePlatform: 'ub-brightspace', sourceUrl: document.sourceUrl, sourceTitle: document.title,
        sourceType: document.documentType, extractedFrom: 'document-text', lastObservedAt: document.lastObservedAt,
        sourceReference
      });
    }
    const meeting = line.match(/(?:lectures?|classes?)\s+meet\s*[:–—-]?\s*(.+)/i);
    if (meeting?.[1]) {
      state.classMeetings.push({
        id: stableId('document-meeting', course.id, meeting[1], document.sourceUrl), courseId: course.id,
        courseCode: course.courseCode, courseTitle: course.courseTitle, title: 'Class meeting',
        meetingPattern: meeting[1], instructor: course.instructor, term: course.term,
        sourcePlatform: 'ub-brightspace', sourceUrl: document.sourceUrl, sourceTitle: document.title,
        sourceType: document.documentType, extractedFrom: 'document-text', lastObservedAt: document.lastObservedAt,
        sourceReference
      });
    }
  }
  return state;
}

