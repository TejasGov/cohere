import { Agent } from '@strands-agents/sdk';
import { A2AExpressServer } from '@strands-agents/sdk/a2a/express';
import type { AcademicState } from '@academic/core';
import { StudentAgent } from '@shadow-cohort/agent';
import type { PeerDescriptor, StudentProfile } from '@shadow-cohort/core';
import { peerAgentCard } from './agent-card';
import { PeerProtocolModel } from './deterministic-model';

export interface PeerServerConfig {
  profile: StudentProfile;
  academicState: AcademicState;
  now: Date;
  host?: string;
  port: number;
}

export interface RunningPeer {
  server: A2AExpressServer;
  descriptor: PeerDescriptor;
  stop(): void;
}

export async function startPeerServer(config: PeerServerConfig): Promise<RunningPeer> {
  const host = config.host ?? '127.0.0.1';
  const card = peerAgentCard(config.profile);
  const controller = new AbortController();
  const server = new A2AExpressServer({
    agentFactory: () => new Agent({
      id: `peer-${config.profile.id}`,
      name: card.name,
      description: card.description,
      model: new PeerProtocolModel(new StudentAgent(config.profile, config.academicState, config.now)),
      printer: false
    }),
    name: card.name,
    description: card.description,
    version: card.version,
    host,
    port: config.port,
    skills: card.skills
  });
  await server.serve({ signal: controller.signal });
  return {
    server,
    descriptor: { studentId: config.profile.id, displayName: config.profile.displayName, endpoint: `http://${host}:${server.port}` },
    stop: () => controller.abort()
  };
}
