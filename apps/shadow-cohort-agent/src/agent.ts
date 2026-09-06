import { Agent } from '@strands-agents/sdk';
import { z } from 'zod';
import type { AcademicState } from '@academic/core';
import {
  calculateStudentCapacity,
  createPeerCapacitySummary,
  evaluateTaskBid,
  summarizeAcademicWorkload,
  type PeerCapacitySummary,
  type ProjectTask,
  type StudentCapacity,
  type StudentProfile,
  type StudentWorkloadSummary,
  type TaskBid
} from '@shadow-cohort/core';
import { createStudentTools } from './tools';

export const STUDENT_AGENT_SYSTEM_PROMPT = `You represent one student during group-project planning.

Your job is to protect the student's academic workload while helping the group succeed.
Never claim technical skills the student did not explicitly provide.
Use workload and capacity tools before accepting significant work.
When evaluating a project task, return a clear structured TaskBid.
Do not expose the student's raw academic records to other agents.
Numeric fit scores must come from evaluate_task; never invent or alter them.`;

const taskBidSchema = z.object({
  studentId: z.string(),
  taskId: z.string(),
  skillFit: z.number().min(0).max(1),
  capacityFit: z.number().min(0).max(1),
  preferenceFit: z.number().min(0).max(1),
  overallFit: z.number().min(0).max(1),
  willing: z.boolean(),
  estimatedAvailableHours: z.number().nonnegative(),
  explanation: z.string()
});

/** Local deterministic boundary. Model use is optional and cannot alter bid scores. */
export class StudentAgent {
  constructor(
    readonly profile: StudentProfile,
    private readonly academicState: AcademicState,
    private readonly now = new Date()
  ) {}

  getWorkloadSummary(): StudentWorkloadSummary {
    return summarizeAcademicWorkload(this.academicState, this.now);
  }

  getCapacity(): StudentCapacity {
    return calculateStudentCapacity(this.profile, this.getWorkloadSummary());
  }

  evaluateTask(task: ProjectTask): TaskBid {
    return evaluateTaskBid(this.profile, this.getCapacity(), task);
  }

  getPeerCapacitySummary(): PeerCapacitySummary {
    return createPeerCapacitySummary(this.profile, this.getCapacity());
  }

  /** Creates the official Strands agent. Invocation uses the caller's configured model credentials. */
  createStrandsAgent(): Agent {
    return new Agent({
      id: `shadow-cohort-${this.profile.id}`,
      name: `${this.profile.displayName} Student Agent`,
      description: 'A privacy-preserving student task-bidding agent.',
      systemPrompt: STUDENT_AGENT_SYSTEM_PROMPT,
      tools: createStudentTools({ profile: this.profile, academicState: this.academicState, now: this.now }),
      structuredOutputSchema: taskBidSchema,
      printer: false
    });
  }
}
