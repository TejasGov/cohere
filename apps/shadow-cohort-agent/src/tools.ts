import { tool, type InvokableTool } from '@strands-agents/sdk';
import { z } from 'zod';
import type { AcademicState } from '@academic/core';
import {
  calculateStudentCapacity,
  evaluateTaskBid,
  summarizeAcademicWorkload,
  type ProjectTask,
  type StudentProfile
} from '@shadow-cohort/core';

export interface StudentAgentContext {
  profile: StudentProfile;
  academicState: AcademicState;
  now?: Date;
}

const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  requiredSkills: z.array(z.string().min(1)),
  estimatedHours: z.number().nonnegative(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  dependencies: z.array(z.string())
});

export function createStudentTools(context: StudentAgentContext): InvokableTool<unknown, unknown>[] {
  const workload = (): ReturnType<typeof summarizeAcademicWorkload> => summarizeAcademicWorkload(context.academicState, context.now);
  const capacity = (): ReturnType<typeof calculateStudentCapacity> => calculateStudentCapacity(context.profile, workload());
  return [
    tool({ name: 'get_student_profile', description: 'Get explicitly declared student skills, availability, and preferences.', inputSchema: z.object({}), callback: () => context.profile }),
    tool({ name: 'get_workload_summary', description: 'Get deterministic workload counts and pressure from normalized academic data.', inputSchema: z.object({}), callback: () => workload() }),
    tool({ name: 'get_student_capacity', description: 'Get deterministic project capacity after academic-pressure adjustment.', inputSchema: z.object({}), callback: () => capacity() }),
    tool({ name: 'evaluate_task', description: 'Return a deterministic structured TaskBid for one proposed project task.', inputSchema: taskSchema, callback: (task: ProjectTask) => evaluateTaskBid(context.profile, capacity(), task) }),
    tool({ name: 'list_upcoming_academic_pressure', description: 'List normalized dated items in the next seven days for private local planning.', inputSchema: z.object({}), callback: () => ({ items: workload().datedItemsNext7Days }) })
  ];
}
