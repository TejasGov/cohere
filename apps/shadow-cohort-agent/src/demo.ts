import type { ProjectTask, TaskBid } from '@shadow-cohort/core';
import { StudentAgent } from './agent';
import {
  DEMO_NOW, backendApiTask, mlTask, reactUiTask,
  studentAAcademicState, studentAProfile,
  studentBAcademicState, studentBProfile,
  studentCAcademicState, studentCProfile
} from './profile';

function label(score: number): string {
  if (score >= 0.8) return 'strong';
  if (score >= 0.55) return 'medium';
  return 'low';
}

function printBid(name: string, task: ProjectTask, bid: TaskBid): void {
  console.log(`\nTASK BID\nStudent: ${name}\nTask: ${task.title}`);
  console.log(`Skill fit: ${bid.skillFit} (${label(bid.skillFit)})`);
  console.log(`Capacity fit: ${bid.capacityFit} (${label(bid.capacityFit)})`);
  console.log(`Overall fit: ${bid.overallFit} (${label(bid.overallFit)})`);
  console.log(`Estimated available hours: ${bid.estimatedAvailableHours}`);
  console.log(`Recommendation: ${bid.willing ? 'Willing to take task' : 'Do not take task now'}`);
  console.log(`Reason: ${bid.explanation}`);
}

const studentA = new StudentAgent(studentAProfile, studentAAcademicState, DEMO_NOW);
const studentB = new StudentAgent(studentBProfile, studentBAcademicState, DEMO_NOW);
const studentC = new StudentAgent(studentCProfile, studentCAcademicState, DEMO_NOW);

console.log('SHADOW COHORT — deterministic local student-agent demo');
printBid(studentAProfile.displayName, backendApiTask, studentA.evaluateTask(backendApiTask));
printBid(studentAProfile.displayName, reactUiTask, studentA.evaluateTask(reactUiTask));
printBid(studentBProfile.displayName, reactUiTask, studentB.evaluateTask(reactUiTask));
printBid(studentCProfile.displayName, mlTask, studentC.evaluateTask(mlTask));
