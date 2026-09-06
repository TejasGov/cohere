import type { GroupProject, PeerDescriptor, ProjectPlan } from '@shadow-cohort/core';

export function renderBoard(project: GroupProject, plan: ProjectPlan, peers: PeerDescriptor[]): string {
  const names = new Map(peers.map((peer) => [peer.studentId, peer.displayName]));
  const tasks = new Map(project.tasks.map((task) => [task.id, task]));
  const lines = ['PROJECT BOARD', '', 'TODO'];
  for (const allocation of plan.allocations) {
    lines.push(`${tasks.get(allocation.taskId)?.title ?? allocation.taskId} | ${names.get(allocation.studentId) ?? allocation.studentId} | ${allocation.estimatedHours}h`);
  }
  lines.push('', 'IN PROGRESS', '(none)', '', 'DONE', '(none)');
  if (plan.unallocatedTasks.length > 0) {
    lines.push('', 'UNASSIGNED');
    for (const item of plan.unallocatedTasks) lines.push(`${tasks.get(item.taskId)?.title ?? item.taskId} | ${item.estimatedHours}h | ${item.reason}`);
  }
  return lines.join('\n');
}
