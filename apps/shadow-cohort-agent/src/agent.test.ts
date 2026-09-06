import { describe, expect, it } from 'vitest';
import { StudentAgent, STUDENT_AGENT_SYSTEM_PROMPT } from './agent';
import { createStudentTools } from './tools';
import { DEMO_NOW, backendApiTask, mlTask, studentAAcademicState, studentAProfile, studentCAcademicState, studentCProfile } from './profile';

describe('StudentAgent', () => {
  it('uses deterministic workload and capacity before bidding', () => {
    const agent = new StudentAgent(studentAProfile, studentAAcademicState, DEMO_NOW);
    expect(agent.getWorkloadSummary().estimatedLoad).toBe('medium');
    expect(agent.getCapacity().availableProjectHours).toBe(6);
    expect(agent.evaluateTask(backendApiTask)).toMatchObject({ studentId: 'student-a', willing: true, estimatedAvailableHours: 6 });
  });
  it('keeps skill fit high while rejecting a large task under low capacity', () => {
    const bid = new StudentAgent(studentCProfile, studentCAcademicState, DEMO_NOW).evaluateTask(mlTask);
    expect(bid.skillFit).toBeGreaterThan(0.8);
    expect(bid.capacityFit).toBeLessThan(0.2);
    expect(bid.willing).toBe(false);
  });
  it('registers only normalized-data Strands tools', () => {
    const tools = createStudentTools({ profile: studentAProfile, academicState: studentAAcademicState, now: DEMO_NOW });
    expect(tools.map((item) => item.name)).toEqual(['get_student_profile', 'get_workload_summary', 'get_student_capacity', 'evaluate_task', 'list_upcoming_academic_pressure']);
    expect(STUDENT_AGENT_SYSTEM_PROMPT).toContain('Never claim technical skills');
    expect(STUDENT_AGENT_SYSTEM_PROMPT).toContain('Do not expose');
  });
});
