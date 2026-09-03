import { BRIDGE_CHANNEL, isBridgeResponse, type BridgeRequest } from './protocol';
import type { AcademicToolName } from './tools';

export class AcademicBridgeClient {
  constructor(private readonly target: Window = window, private readonly timeoutMilliseconds = 5_000) {}
  request(operation: AcademicToolName, input: unknown): Promise<unknown> {
    const requestId = crypto.randomUUID();
    const request: BridgeRequest = { channel: BRIDGE_CHANNEL, direction: 'request', requestId, operation, input };
    return new Promise((resolve, reject) => {
      const cleanup = (): void => { this.target.removeEventListener('message', listener); window.clearTimeout(timeout); };
      const listener = (event: MessageEvent): void => {
        if (event.source !== this.target || event.origin !== location.origin || !isBridgeResponse(event.data) || event.data.requestId !== requestId) return;
        cleanup();
        if (event.data.ok) resolve(event.data.result); else reject(new Error(event.data.error));
      };
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Academic bridge request timed out')); }, this.timeoutMilliseconds);
      this.target.addEventListener('message', listener);
      this.target.postMessage(request, location.origin);
    });
  }
}
