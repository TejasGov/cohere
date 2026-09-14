import { DEMO_NOW } from '@shadow-cohort/agent/profile';
import { happyPathTeamScenario, overloadedTeamScenario } from '@shadow-cohort/agent/scenarios';

export function peerFixture(id: string, scenarioId: string) {
  const scenario = scenarioId === 'happy-path' ? happyPathTeamScenario : overloadedTeamScenario;
  const fixture = scenario.students[id];
  if (fixture) return { ...fixture, now: DEMO_NOW };
  throw new Error(`Unknown sanitized peer fixture: ${id}`);
}
