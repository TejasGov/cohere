import { afterEach, describe, expect, it } from 'vitest';
import { emptyAcademicState } from '@academic/core';
import { AcademicBridgeClient } from './bridge-client';
import { installAcademicBridge } from './bridge-server';
import { BRIDGE_CHANNEL, type BridgeRequest, type BridgeResponse } from './protocol';

class FakeWindow extends EventTarget {
  onPost?: (data: unknown) => void;
  postMessage(data: unknown): void {
    this.onPost?.(data);
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: this as unknown as WindowProxy })));
  }
}
const context = { state: emptyAcademicState('brightspace', new URL('http://localhost:5173/brightspace'), '2026-09-03T12:00:00.000Z'), scanStatus: 'complete' as const };

describe('WebMCP bridge', () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());
  it('executes a valid one-to-one academic request', async () => {
    const target = new FakeWindow(); cleanup = installAcademicBridge(async () => context, target as unknown as Window);
    const client = new AcademicBridgeClient(target as unknown as Window, 100);
    await expect(client.request('academic_get_overview', {})).resolves.toMatchObject({ courses: 0, scanStatus: 'complete' });
  });
  it('rejects an unknown operation', async () => {
    const target = new FakeWindow(); cleanup = installAcademicBridge(async () => context, target as unknown as Window);
    const response = new Promise<BridgeResponse>((resolve) => {
      target.addEventListener('message', (event) => { const data = (event as MessageEvent).data as Partial<BridgeResponse>; if (data.direction === 'response') resolve(data as BridgeResponse); });
    });
    target.postMessage({ channel: BRIDGE_CHANNEL, direction: 'request', requestId: 'unknown-1', operation: 'read_dom', input: {} });
    await expect(response).resolves.toMatchObject({ requestId: 'unknown-1', ok: false, error: 'Unknown academic operation' });
  });
  it('rejects malformed tool input', async () => {
    const target = new FakeWindow(); cleanup = installAcademicBridge(async () => context, target as unknown as Window);
    const client = new AcademicBridgeClient(target as unknown as Window, 100);
    await expect(client.request('academic_get_courses', { cookie: true })).rejects.toThrow('unsupported property');
  });
  it('times out instead of hanging', async () => {
    const target = new FakeWindow();
    const client = new AcademicBridgeClient(target as unknown as Window, 5);
    await expect(client.request('academic_get_overview', {})).rejects.toThrow('timed out');
  });
  it('does not mix response IDs', async () => {
    const target = new FakeWindow();
    target.onPost = (data) => {
      const request = data as BridgeRequest;
      if (request.direction !== 'request') return;
      target.postMessage({ channel: BRIDGE_CHANNEL, direction: 'response', requestId: 'different', ok: true, result: 'wrong' });
      target.postMessage({ channel: BRIDGE_CHANNEL, direction: 'response', requestId: request.requestId, ok: true, result: 'correct' });
    };
    const client = new AcademicBridgeClient(target as unknown as Window, 100);
    await expect(client.request('academic_get_overview', {})).resolves.toBe('correct');
  });
});
