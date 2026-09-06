export type SourcePlatform = 'brightspace' | 'ub-brightspace' | 'blackboard' | 'university-portal' | 'unknown';

export type AcademicStatus = 'active' | 'published' | 'scheduled' | 'cancelled' | 'completed' | 'unknown';

export interface SourceReference {
  sourcePlatform: SourcePlatform;
  sourceUrl: string;
  /** Optional stable identifier exposed by the source DOM. */
  sourceId?: string;
  sourceTitle?: string;
  sourceType?: DocumentType | 'brightspace-page';
  extractedFrom?: 'visible-dom' | 'document-text';
  lastObservedAt: string;
}

export type DocumentType = 'syllabus' | 'assignment' | 'exam-schedule' | 'course-policy';
export type TextExtractionStatus = 'pending' | 'complete' | 'cached' | 'unsupported_image_pdf' | 'unsupported' | 'failed';

interface AcademicEntity extends SourceReference {
  id: string;
  status?: AcademicStatus;
  sourceReference?: SourceReference;
}

export interface DocumentReference extends SourceReference {
  processing?: DocumentProcessingDiagnostics;
  id: string;
  courseId: string;
  courseCode?: string;
  title: string;
  documentType: DocumentType;
  mimeType?: string;
  textExtractionStatus: TextExtractionStatus;
}

export interface DocumentProcessingDiagnostics {
  resolvedSourceUrl?: string;
  discoveryPage?: string;
  classificationResult: string;
  fetchStatus: 'pending' | 'success' | 'failed';
  extractionStatus: string;
  mimeType?: string;
  pageCount?: number;
  textCharacterCount: number;
  factCount: number;
  failureReason?: string;
  truncated?: boolean;
  assignmentsFound?: number;
  examsFound?: number;
  gradingPoliciesFound?: number;
  attendancePoliciesFound?: number;
  officeHoursFound?: number;
  classMeetingsFound?: number;
}

export interface CoursePolicy extends AcademicEntity {
  courseId: string;
  courseCode?: string;
  title: string;
  policyType: 'grading' | 'attendance' | 'general';
  description: string;
}

export interface OfficeHours extends AcademicEntity {
  courseId: string;
  courseCode?: string;
  title: string;
  scheduleText: string;
  location?: string;
  instructor?: string;
}

export interface AcademicConflict {
  id: string;
  type: 'DUE_DATE_CONFLICT' | 'START_DATE_CONFLICT';
  courseId?: string;
  courseCode?: string;
  entityTitle: string;
  sources: SourceReference[];
  values: Array<{ value: string; source: SourceReference }>;
  detectedAt: string;
}

export interface Course extends AcademicEntity {
  courseCode?: string;
  courseTitle?: string;
  instructor?: string;
  term?: string;
}

export interface Assignment extends AcademicEntity {
  courseId: string;
  courseCode?: string;
  courseTitle?: string;
  title: string;
  description?: string;
  dueAt?: string;
  pointsPossible?: number;
}

export interface Exam extends AcademicEntity {
  courseId: string;
  courseCode?: string;
  courseTitle?: string;
  title: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
  location?: string;
  pointsPossible?: number;
}

export interface Announcement extends AcademicEntity {
  courseId?: string;
  courseCode?: string;
  courseTitle?: string;
  title: string;
  description?: string;
}

export interface ClassMeeting extends AcademicEntity {
  courseId: string;
  courseCode?: string;
  courseTitle?: string;
  title: string;
  meetingPattern?: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  instructor?: string;
  term?: string;
}

export interface ExtractionDiagnostics {
  adapterSelected: string;
  hostname: string;
  pathname: string;
  candidateCourseLinks: number;
  candidateHrefPatterns: string[];
  potentialCourseCardContainers: number;
  candidateAnnouncementContainers?: number;
  candidateAnnouncementTitles?: number;
  assignmentPageDetected?: boolean;
  candidateAssignmentLinks?: number;
  candidateAssignmentContainers?: number;
  candidateExamLinks?: number;
  candidateExamContainers?: number;
  scannedDomRoots?: number;
  candidateCourseHosts?: number;
  framesInspected?: number;
  frameCourseDiscovery?: Array<{
    pathname: string;
    candidateCourseLinks: number;
    candidateCourseHosts?: number;
    coursesExtracted: number;
  }>;
}

export interface AcademicState {
  sourcePlatform: SourcePlatform;
  sourceUrl: string;
  lastObservedAt: string;
  courses: Course[];
  assignments: Assignment[];
  exams: Exam[];
  announcements: Announcement[];
  classMeetings: ClassMeeting[];
  documents: DocumentReference[];
  policies: CoursePolicy[];
  officeHours: OfficeHours[];
  conflicts: AcademicConflict[];
  diagnostics?: ExtractionDiagnostics;
}

export interface AcademicAdapter {
  readonly id: Exclude<SourcePlatform, 'unknown'>;
  canHandle(document: Document, url: URL): boolean;
  extract(document: Document, url: URL): AcademicState;
}


