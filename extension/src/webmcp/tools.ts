import type { AcademicState, SemesterScanStatus, SourceReference } from '@academic/core';

export const ACADEMIC_TOOL_NAMES = [
  'academic_get_overview', 'academic_get_courses', 'academic_get_upcoming',
  'academic_get_announcements', 'academic_get_policies', 'academic_get_conflicts', 'academic_get_sources'
] as const;
export type AcademicToolName = typeof ACADEMIC_TOOL_NAMES[number];
export interface AcademicToolContext { state: AcademicState; scanStatus: SemesterScanStatus; }

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Input must be an object');
  return value as RecordValue;
}
function fields(value: unknown, allowed: readonly string[]): RecordValue {
  const input = record(value);
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error('Input contains an unsupported property');
  return input;
}
function optionalString(input: RecordValue, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return;
  if (typeof value !== 'string' || !value.trim()) throw new Error(key + ' must be a non-empty string');
  return value.trim();
}
function courseMatches(actual: string | undefined, requested: string | undefined): boolean {
  return requested === undefined || actual?.trim().toLocaleUpperCase() === requested.toLocaleUpperCase();
}
function parseBoundary(value: string | undefined, end: boolean): number | undefined {
  if (value === undefined) return;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) throw new Error('Date filters must use ISO 8601');
  const expanded = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + (end ? 'T23:59:59.999' : 'T00:00:00.000') : value;
  const parsed = Date.parse(expanded);
  if (!Number.isFinite(parsed)) throw new Error('Date filters must be valid ISO 8601 values');
  return parsed;
}
function sourceFrom(value: { sourceReference?: SourceReference } & SourceReference): SourceReference {
  return value.sourceReference ?? {
    sourcePlatform: value.sourcePlatform, sourceUrl: value.sourceUrl, sourceId: value.sourceId,
    sourceTitle: value.sourceTitle, sourceType: value.sourceType, extractedFrom: value.extractedFrom,
    lastObservedAt: value.lastObservedAt
  };
}
function compactSource(source: SourceReference) {
  return { title: source.sourceTitle, type: source.sourceType, url: source.sourceUrl, extractedFrom: source.extractedFrom, lastObservedAt: source.lastObservedAt };
}

export function executeAcademicTool(name: AcademicToolName, rawInput: unknown, context: AcademicToolContext): unknown {
  const { state } = context;
  if (name === 'academic_get_overview') {
    fields(rawInput, []);
    return {
      scanStatus: context.scanStatus, courses: state.courses.length, assignments: state.assignments.length,
      exams: state.exams.length, announcements: state.announcements.length, policies: state.policies.length,
      documentsScanned: state.documents.filter((item) => item.textExtractionStatus === 'complete' || item.textExtractionStatus === 'cached').length,
      conflicts: state.conflicts.length, lastUpdatedAt: state.lastObservedAt
    };
  }
  if (name === 'academic_get_courses') {
    const courseCode = optionalString(fields(rawInput, ['courseCode']), 'courseCode');
    return state.courses.filter((course) => courseMatches(course.courseCode, courseCode));
  }
  if (name === 'academic_get_upcoming') {
    const input = fields(rawInput, ['courseCode', 'startDate', 'endDate']);
    const courseCode = optionalString(input, 'courseCode');
    const start = parseBoundary(optionalString(input, 'startDate'), false);
    const end = parseBoundary(optionalString(input, 'endDate'), true);
    if (start !== undefined && end !== undefined && start > end) throw new Error('startDate must not be after endDate');
    const inRange = (value: string | undefined): boolean => {
      if (value === undefined) return start === undefined && end === undefined;
      const time = Date.parse(value);
      if (!Number.isFinite(time)) return false;
      return (start === undefined || time >= start) && (end === undefined || time <= end);
    };
    const chronological = <T>(date: (item: T) => string | undefined) => (left: T, right: T): number => {
      const a = date(left); const b = date(right);
      if (!a) return b ? 1 : 0;
      if (!b) return -1;
      return Date.parse(a) - Date.parse(b);
    };
    return {
      assignments: state.assignments.filter((item) => courseMatches(item.courseCode, courseCode) && inRange(item.dueAt)).sort(chronological((item) => item.dueAt)),
      exams: state.exams.filter((item) => courseMatches(item.courseCode, courseCode) && inRange(item.startsAt ?? item.dueAt)).sort(chronological((item) => item.startsAt ?? item.dueAt))
    };
  }
  if (name === 'academic_get_announcements') {
    const courseCode = optionalString(fields(rawInput, ['courseCode']), 'courseCode');
    return state.announcements.filter((item) => courseMatches(item.courseCode, courseCode));
  }
  if (name === 'academic_get_policies') {
    const input = fields(rawInput, ['courseCode', 'policyType']);
    const courseCode = optionalString(input, 'courseCode');
    const policyType = optionalString(input, 'policyType');
    if (policyType && !['grading', 'attendance', 'office_hours', 'class_meeting', 'other'].includes(policyType)) throw new Error('Unsupported policyType');
    const values = [
      ...state.policies.map((item) => ({ id: item.id, courseCode: item.courseCode, type: item.policyType === 'general' ? 'other' : item.policyType, text: item.description, source: compactSource(sourceFrom(item)) })),
      ...state.officeHours.map((item) => ({ id: item.id, courseCode: item.courseCode, type: 'office_hours', text: item.scheduleText, location: item.location, source: compactSource(sourceFrom(item)) })),
      ...state.classMeetings.filter((item) => item.extractedFrom === 'document-text').map((item) => ({ id: item.id, courseCode: item.courseCode, type: 'class_meeting', text: item.meetingPattern, location: item.location, source: compactSource(sourceFrom(item)) }))
    ];
    return values.filter((item) => courseMatches(item.courseCode, courseCode) && (policyType === undefined || item.type === policyType));
  }
  if (name === 'academic_get_conflicts') {
    const courseCode = optionalString(fields(rawInput, ['courseCode']), 'courseCode');
    return state.conflicts.filter((item) => courseMatches(item.courseCode, courseCode));
  }
  const entityId = optionalString(fields(rawInput, ['entityId']), 'entityId');
  if (!entityId) throw new Error('entityId is required');
  const entities = [...state.courses, ...state.assignments, ...state.exams, ...state.announcements, ...state.classMeetings, ...state.documents, ...state.policies, ...state.officeHours];
  const entity = entities.find((item) => item.id === entityId);
  const sources = state.conflicts.find((item) => item.id === entityId)?.sources ?? (entity ? [sourceFrom(entity)] : []);
  const unique = new Map(sources.map((source) => [source.sourceUrl + '|' + (source.sourceTitle ?? '') + '|' + (source.sourceType ?? ''), compactSource(source)]));
  return { entityId, sources: [...unique.values()] };
}
