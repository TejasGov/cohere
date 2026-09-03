import { ACADEMIC_TOOL_NAMES, type AcademicToolName } from './tools';

export interface JsonSchema { type: 'object'; properties: Record<string, { type: 'string'; description?: string }>; required?: string[]; additionalProperties: false; }
export interface AcademicToolDefinition { name: AcademicToolName; description: string; inputSchema: JsonSchema; }
const schema = (properties: JsonSchema['properties'] = {}, required?: string[]): JsonSchema => ({ type: 'object', properties, ...(required ? { required } : {}), additionalProperties: false });
const courseCode = { type: 'string' as const, description: 'Optional normalized course-code filter, for example CSE 341' };
export const ACADEMIC_TOOL_DEFINITIONS: AcademicToolDefinition[] = [
  { name: ACADEMIC_TOOL_NAMES[0], description: "Return a concise overview of the student's locally collected academic semester, including course, assignment, exam, announcement, policy, document, and conflict counts.", inputSchema: schema() },
  { name: ACADEMIC_TOOL_NAMES[1], description: "Return courses from the student's normalized academic semester.", inputSchema: schema({ courseCode }) },
  { name: ACADEMIC_TOOL_NAMES[2], description: "Return upcoming assignments and exams across the student's courses within an optional date range.", inputSchema: schema({ courseCode, startDate: { type: 'string', description: 'Optional ISO 8601 start date' }, endDate: { type: 'string', description: 'Optional ISO 8601 end date' } }) },
  { name: ACADEMIC_TOOL_NAMES[3], description: "Return normalized course announcements collected from the student's academic systems.", inputSchema: schema({ courseCode }) },
  { name: ACADEMIC_TOOL_NAMES[4], description: 'Return important academic policies extracted from trusted course documents such as syllabi and course-policy documents.', inputSchema: schema({ courseCode, policyType: { type: 'string', description: 'One of grading, attendance, office_hours, class_meeting, or other' } }) },
  { name: ACADEMIC_TOOL_NAMES[5], description: 'Return academic facts where multiple trusted sources disagree, such as conflicting assignment due dates.', inputSchema: schema({ courseCode }) },
  { name: ACADEMIC_TOOL_NAMES[6], description: 'Explain the provenance of a specific academic fact, assignment, exam, or policy.', inputSchema: schema({ entityId: { type: 'string', description: 'Canonical academic entity ID' } }, ['entityId']) }
];
