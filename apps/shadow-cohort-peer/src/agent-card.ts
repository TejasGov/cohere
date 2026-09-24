import type { StudentProfile } from '@shadow-cohort/core';

export function peerAgentCard(profile: StudentProfile) {
  return {
    name: `${profile.displayName} Shadow Cohort Agent`,
    description: 'Evaluates project tasks using private local workload and explicitly declared skills.',
    version: '0.1.0',
    skills: [
      { id: 'get_peer_capacity_summary', name: 'Peer capacity summary', description: 'Returns a privacy-safe coarse capacity summary.', tags: ['capacity', 'privacy'] },
      { id: 'evaluate_project_task', name: 'Evaluate project task', description: 'Returns a validated privacy-safe deterministic TaskBid.', tags: ['task-bid', 'coordination'] },
      { id: 'simulate_academic_overload', name: 'Demo workload change', description: 'Applies a sanitized private workload fixture and returns only a capacity-change notice.', tags: ['demo', 'capacity-change'] },
      { id: 'reset_demo', name: 'Reset demo workload', description: 'Restores the peer demo fixture and returns only a privacy-safe capacity summary.', tags: ['demo', 'reset', 'privacy'] }
    ]
  };
}
