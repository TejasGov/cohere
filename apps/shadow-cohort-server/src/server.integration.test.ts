import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ShadowCohortServer } from './server';

const VERCEL_ORIGIN = 'https://shadow-cohort.vercel.app';
const LOCAL_ORIGIN = 'http://127.0.0.1:5173';
let server: ShadowCohortServer;
let endpoint = '';
let stopped = false;

async function json(path: string, init?: RequestInit): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(`${endpoint}${path}`, init);
  return { response, body: await response.json() as unknown };
}

beforeAll(async () => {
  server = new ShadowCohortServer({
    host: '127.0.0.1',
    port: 0,
    peerPorts: [0, 0, 0],
    allowedOrigins: [VERCEL_ORIGIN, LOCAL_ORIGIN]
  });
  await server.start();
  endpoint = server.endpoint ?? '';
}, 20_000);

afterAll(async () => {
  if (!stopped) await server.stop();
});

describe.sequential('complete local Shadow Cohort server lifecycle', () => {
  it('starts all three A2A peers before the Coordinator API', async () => {
    expect(server.peerCount).toBe(3);
    expect(server.lifecycle.map((event) => `${event.type}:${event.service}`)).toEqual([
      'peer-starting:student-a', 'peer-ready:student-a',
      'peer-starting:student-b', 'peer-ready:student-b',
      'peer-starting:student-c', 'peer-ready:student-c',
      'api-starting:coordinator', 'api-ready:coordinator'
    ]);
  });

  it('reports real peer health and connected initial dashboard state', async () => {
    const health = await json('/health');
    expect(health.response.status).toBe(200);
    expect(health.body).toEqual({
      status: 'ok', service: 'shadow-cohort',
      peers: { 'student-a': 'connected', 'student-b': 'connected', 'student-c': 'connected' }
    });
    const alias = await json('/api/shadow/health');
    expect(alias.body).toEqual(health.body);
    const status = await json('/api/shadow/status');
    expect(status.body).toMatchObject({
      project: { title: 'Campus Marketplace' },
      peers: [
        { studentId: 'student-a', connected: true },
        { studentId: 'student-b', connected: true },
        { studentId: 'student-c', connected: true }
      ]
    });
  });

  it('allows only configured local and dashboard origins', async () => {
    for (const origin of [LOCAL_ORIGIN, VERCEL_ORIGIN]) {
      const response = await fetch(`${endpoint}/health`, { headers: { origin } });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    }
    const preflight = await fetch(`${endpoint}/api/shadow/negotiate`, { method: 'OPTIONS', headers: { origin: LOCAL_ORIGIN } });
    expect(preflight.status).toBe(204);
    const blocked = await fetch(`${endpoint}/health`, { headers: { origin: 'https://untrusted.example' } });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('runs the complete real A2A plan and replan flow through the local public API', async () => {
    const negotiated = await json('/api/shadow/negotiate', { method: 'POST', headers: { origin: LOCAL_ORIGIN } });
    expect(negotiated.body).toMatchObject({ plan: { version: 1, status: 'proposed', allocations: expect.any(Array) } });
    expect((negotiated.body as { plan: { allocations: unknown[] } }).plan.allocations).toHaveLength(6);

    const approved = await json('/api/shadow/plan/approve', { method: 'POST', headers: { origin: LOCAL_ORIGIN } });
    expect(approved.body).toMatchObject({ plan: { version: 1, status: 'approved' } });

    const overload = await json('/api/shadow/demo/student-c-overload', { method: 'POST', headers: { origin: LOCAL_ORIGIN } });
    expect(overload.body).toMatchObject({
      previousPlanVersion: 1,
      proposedPlanVersion: 2,
      status: 'proposed',
      changedAllocations: [{ taskId: 'presentation', oldStudentId: 'student-c', newStudentId: 'student-b' }]
    });

    const replanApproved = await json('/api/shadow/replan/approve', { method: 'POST', headers: { origin: LOCAL_ORIGIN } });
    expect(replanApproved.body).toMatchObject({ plan: { version: 2, status: 'approved' } });
    const status = await fetch(`${endpoint}/api/shadow/status`);
    const serialized = await status.text();
    expect(serialized).toContain('Student C safe capacity changed from 9.6h to 6h');
    expect(serialized).toContain('presentation: student-c → student-b');
    for (const forbidden of ['private-pressure-item', 'private-course', 'sourceUrl', 'Private upcoming work']) expect(serialized).not.toContain(forbidden);
  });

  it('shuts down the Coordinator and peer processes cleanly', async () => {
    await server.stop();
    stopped = true;
    expect(server.peerCount).toBe(0);
    expect(server.lifecycle.at(-1)).toEqual({ type: 'stopped', service: 'shadow-cohort' });
    await expect(fetch(`${endpoint}/health`)).rejects.toThrow();
  });
});
