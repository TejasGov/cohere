import { DEMO_NOW } from '@shadow-cohort/agent/profile';
import { happyPathTeamScenario } from '@shadow-cohort/agent/scenarios';
import {
  ShadowCoordinatorRuntime,
  campusMarketplaceProject,
  startDashboardApi,
  type RunningDashboardApi
} from '@shadow-cohort/coordinator';
import { startPeerServer, type RunningPeer } from '@shadow-cohort/peer';

const STUDENT_IDS = ['student-a', 'student-b', 'student-c'] as const;

export interface ShadowCohortServerOptions {
  allowedOrigins?: string[];
  host?: string;
  peerPorts?: [number, number, number];
  port?: number;
  startupTimeoutMs?: number;
  log?: (message: string) => void;
}

export interface ServerLifecycleEvent {
  type: 'peer-starting' | 'peer-ready' | 'api-starting' | 'api-ready' | 'stopped';
  service: string;
}

async function waitForAgentCard(endpoint: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/.well-known/agent-card.json`);
      if (response.ok) return;
    } catch { /* The peer is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`A2A peer did not become ready within ${timeoutMs}ms: ${endpoint}`);
}

export class ShadowCohortServer {
  readonly lifecycle: ServerLifecycleEvent[] = [];
  private readonly peers: RunningPeer[] = [];
  private api?: RunningDashboardApi;
  private stopping = false;

  constructor(private readonly options: ShadowCohortServerOptions = {}) {}

  get endpoint(): string | undefined { return this.api?.endpoint; }
  get peerCount(): number { return this.peers.length; }
  get publicPort(): number | undefined { return this.api?.port; }

  private emit(type: ServerLifecycleEvent['type'], service: string, message: string): void {
    this.lifecycle.push({ type, service });
    this.options.log?.(message);
  }

  async start(): Promise<this> {
    if (this.api) return this;
    const ports = this.options.peerPorts ?? [9101, 9102, 9103];
    const timeoutMs = this.options.startupTimeoutMs ?? 10_000;
    try {
      for (const [index, studentId] of STUDENT_IDS.entries()) {
        const fixture = happyPathTeamScenario.students[studentId];
        if (!fixture) throw new Error(`Missing production demo fixture for ${studentId}.`);
        this.emit('peer-starting', studentId, `Starting ${fixture.profile.displayName}...`);
        const peer = await startPeerServer({
          profile: fixture.profile,
          academicState: fixture.academicState,
          overloadAcademicState: fixture.overloadAcademicState,
          now: DEMO_NOW,
          host: '127.0.0.1',
          port: ports[index] ?? 0
        });
        this.peers.push(peer);
        await waitForAgentCard(peer.descriptor.endpoint, timeoutMs);
        this.emit('peer-ready', studentId, `${fixture.profile.displayName} ready`);
      }

      this.emit('api-starting', 'coordinator', 'Starting public Coordinator API...');
      const runtime = new ShadowCoordinatorRuntime(campusMarketplaceProject, this.peers.map((peer) => peer.descriptor));
      this.api = await startDashboardApi(runtime, {
        port: this.options.port ?? 9200,
        host: this.options.host ?? '0.0.0.0',
        allowedOrigins: this.options.allowedOrigins
      });
      this.emit('api-ready', 'coordinator', `Public API listening on ${this.api.host}:${this.api.port}`);
      return this;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    try {
      if (this.api) await this.api.stop();
      this.api = undefined;
      this.peers.splice(0).reverse().forEach((peer) => peer.stop());
      await new Promise((resolve) => setTimeout(resolve, 20));
      this.emit('stopped', 'shadow-cohort', 'Shadow Cohort stopped');
    } finally {
      this.stopping = false;
    }
  }
}
