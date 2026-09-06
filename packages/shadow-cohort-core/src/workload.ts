import type { AcademicState, Assignment, Exam } from '@academic/core';
import type { AcademicPressure, AcademicWorkItem, StudentWorkloadSummary } from './schema';

const DAY_MS = 86_400_000;
const MAJOR_PATTERN = /\b(project|capstone|term paper|final)\b/i;
const QUIZ_PATTERN = /\bquiz\b/i;

function daysFrom(now: Date, iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return undefined;
  return (value.getTime() - now.getTime()) / DAY_MS;
}

function assignmentItem(assignment: Assignment): AcademicWorkItem | undefined {
  if (!assignment.dueAt) return undefined;
  return { id: assignment.id, kind: QUIZ_PATTERN.test(assignment.title) ? 'quiz' : 'assignment', title: assignment.title, occursAt: assignment.dueAt, courseId: assignment.courseId, major: MAJOR_PATTERN.test(assignment.title) };
}

function examItem(exam: Exam): AcademicWorkItem | undefined {
  const occursAt = exam.startsAt ?? exam.dueAt;
  if (!occursAt) return undefined;
  const quiz = QUIZ_PATTERN.test(exam.title);
  return { id: exam.id, kind: quiz ? 'quiz' : 'exam', title: exam.title, occursAt, courseId: exam.courseId, major: !quiz };
}

function loadLevel(score: number): AcademicPressure {
  if (score === 0) return 'low';
  if (score <= 3) return 'medium';
  if (score <= 7) return 'high';
  return 'critical';
}

/** Deterministic pressure: assignment +1, major project +2 total, quiz +1, exam +3, and each additional same-day deadline +1. */
export function summarizeAcademicWorkload(state: AcademicState, now = new Date()): StudentWorkloadSummary {
  const assignments = state.assignments.map(assignmentItem).filter((item): item is AcademicWorkItem => item !== undefined);
  const exams = state.exams.map(examItem).filter((item): item is AcademicWorkItem => item !== undefined);
  const inWindow = (item: AcademicWorkItem, days: number): boolean => {
    const distance = daysFrom(now, item.occursAt);
    return distance !== undefined && distance >= 0 && distance <= days;
  };
  const upcomingAssignments = assignments.filter((item) => inWindow(item, 14));
  const upcomingExams = exams.filter((item) => inWindow(item, 14));
  const upcoming = [...upcomingAssignments, ...upcomingExams];
  const within7 = upcoming.filter((item) => inWindow(item, 7));
  let score = within7.reduce((total, item) => item.kind === 'exam' ? total + 3 : total + (item.major ? 2 : 1), 0);
  const dateCounts = new Map<string, number>();
  for (const item of within7) {
    const key = item.occursAt.slice(0, 10);
    dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1);
  }
  score += [...dateCounts.values()].reduce((extra, count) => extra + Math.max(0, count - 1), 0);
  const isMajor = (item: AcademicWorkItem): boolean => item.major || item.kind === 'exam';
  return {
    upcomingAssignments: upcomingAssignments.length,
    upcomingExams: upcomingExams.filter((item) => item.kind === 'exam').length,
    majorDeadlinesNext7Days: within7.filter(isMajor).length,
    majorDeadlinesNext14Days: upcoming.filter(isMajor).length,
    datedItemsNext7Days: within7.sort((a, b) => a.occursAt.localeCompare(b.occursAt)),
    estimatedLoad: loadLevel(score),
    calculatedAt: now.toISOString()
  };
}
