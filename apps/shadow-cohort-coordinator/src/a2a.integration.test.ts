import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPeerServer, type RunningPeer } from '@shadow-cohort/peer';
import {
  DEMO_NOW,
  backendApiTask,
  studentAAcademicState, studentAProfile,
  studentBAcademicState, studentBProfile,
  studentCAcademicState, studentCProfile
} from '@shadow-cohort/agent/profile';
import { A2APeerClient } from './a2a-client';
import { CoordinatorAgent } from './coordinator';
import { campusMarketplaceProject } from './project';

let peers: RunningPeer[] = [];

function peerAt(index: number): RunningPeer {
  const peer = peers[index];
  if (!peer) throw new Error(`Missing test peer at index ${index}.`);
  return peer;
}

beforeAll(async () => {
  peers = await Promise.all([
    startPeerServer({ profile: studentAProfile, academicState: studentAAcademicState, now: DEMO_NOW, port: 0 }),
    startPeerServer({ profile: studentBProfile, academicState: studentBAcademicState, now: DEMO_NOW, port: 0 }),
    startPeerServer({ profile: studentCProfile, academicState: studentCAcademicState, now: DEMO_NOW, port: 0 })
  ]);
});

afterAll(async () => {
  peers.forEach((peer) => peer.stop());
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe('real Strands A2A client/server integration', () => {
  it('travels over localhost A2A and returns Student A deterministic TaskBid', async () => {
    const client = new A2APeerClient(peerAt(0).descriptor);
    const card = await client.discover();
    const bid = await client.evaluateTask(backendApiTask);
    expect(card.skills).toContain('evaluate_project_task');
    expect(bid).toMatchObject({ studentId: 'student-a', taskId: 'backend-api', overallFit: 0.81, willing: true });
    expect(JSON.stringify(bid)).not.toContain('demo-course');
    expect(JSON.stringify(bid)).not.toContain('Assignment');
    expect(JSON.stringify(bid)).not.toContain('sourceUrl');
  });

  it('coordinates three actual local A2A peers and collects every bid before allocation', async () => {
    const result = await new CoordinatorAgent(peers.map((peer) => peer.descriptor)).negotiate(campusMarketplaceProject);
    expect(result.connectedPeers).toHaveLength(3);
    for (const task of campusMarketplaceProject.tasks) expect(result.bidsByTask[task.id]).toHaveLength(3);
    expect(result.plan.status).toBe('proposed');
    expect(result.plan.allocations).toContainEqual(expect.objectContaining({ taskId: 'frontend-ui', studentId: 'student-b' }));
    expect(result.plan.unallocatedTasks).toContainEqual(expect.objectContaining({ taskId: 'backend-api' }));
    const firstAllocation = result.events.findIndex((event) => event.message.includes('→'));
    expect(firstAllocation).toBeGreaterThan(0);
    expect(result.events.slice(0, firstAllocation).filter((event) => event.message.startsWith('Bid received:'))).toHaveLength(18);
  });

  it('continues a partial plan when one peer is offline', async () => {
    const offline = { studentId: 'offline', displayName: 'Offline Student', endpoint: 'http://127.0.0.1:1' };
    const result = await new CoordinatorAgent([peerAt(0).descriptor, offline], 250).negotiate({ ...campusMarketplaceProject, tasks: [backendApiTask] });
    expect(result.connectedPeers).toHaveLength(1);
    expect(result.plan.warnings.join(' ')).toContain('Offline Student');
    expect(result.plan.status).toBe('proposed');
  });

  it('ignores a duplicate peer response deterministically', async () => {
    const descriptor = peerAt(0).descriptor;
    const result = await new CoordinatorAgent([descriptor, descriptor]).negotiate({ ...campusMarketplaceProject, tasks: [{ ...backendApiTask, estimatedHours: 4 }] });
    expect(result.bidsByTask['backend-api']).toHaveLength(1);
    expect(result.plan.warnings.join(' ')).toContain('Duplicate response ignored');
  });

  it('times out a peer whose agent-card endpoint never responds', async () => {
    const sockets = new Set<Socket>();
    const server = createServer(() => undefined);
    server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Test server did not bind.');
    const client = new A2APeerClient({ studentId: 'slow', displayName: 'Slow Peer', endpoint: `http://127.0.0.1:${address.port}` }, 50);
    await expect(client.discover()).rejects.toThrow('timed out');
    sockets.forEach((socket) => socket.destroy());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
