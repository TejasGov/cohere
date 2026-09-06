import { createPeerCapacitySummary, toPeerTaskBidResponse, validateGroupProject, validatePeerCapacitySummary, type ProjectTask } from '@shadow-cohort/core';
import { StudentAgent } from '@shadow-cohort/agent';

export type PeerRequest =
  | { operation: 'get_peer_capacity_summary' }
  | { operation: 'evaluate_project_task'; task: ProjectTask };

function parseRequest(text: string): PeerRequest {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || !('operation' in value)) throw new Error('Invalid peer request envelope.');
  const request = value as Record<string, unknown>;
  if (request.operation === 'get_peer_capacity_summary') return { operation: request.operation };
  if (request.operation === 'evaluate_project_task' && typeof request.task === 'object' && request.task !== null) {
    const task = request.task as ProjectTask;
    const errors = validateGroupProject({ id: 'request', title: 'Request', description: 'Validation envelope', deadline: '2099-01-01T00:00:00.000Z', tasks: [task] });
    if (errors.length === 0) return { operation: request.operation, task };
  }
  throw new Error('Unsupported or malformed peer operation.');
}

export function handlePeerMessage(agent: StudentAgent, text: string): string {
  const request = parseRequest(text);
  if (request.operation === 'evaluate_project_task') return JSON.stringify(toPeerTaskBidResponse(agent.evaluateTask(request.task)));
  const summary = createPeerCapacitySummary(agent.profile, agent.getCapacity());
  if (!validatePeerCapacitySummary(summary)) throw new Error('Refusing to send an invalid peer capacity summary.');
  return JSON.stringify(summary);
}
