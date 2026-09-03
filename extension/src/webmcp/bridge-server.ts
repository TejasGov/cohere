import type { AcademicState, SemesterScanStatus } from '@academic/core';
import { BRIDGE_CHANNEL, isAcademicToolName, isBridgeRequest, type BridgeResponse } from './protocol';
import { executeAcademicTool } from './tools';

export interface BridgeAcademicContext { state: AcademicState; scanStatus: SemesterScanStatus; }
export type AcademicContextProvider = () => Promise<BridgeAcademicContext>;

export function installAcademicBridge(getContext: AcademicContextProvider, target: Window = window): () => void {
  const listener = (event: MessageEvent): void => {
    if (event.source !== target || event.origin !== location.origin || typeof event.data !== 'object' || event.data === null) return;
    const candidate = event.data as Record<string, unknown>;
    if (candidate.channel !== BRIDGE_CHANNEL || candidate.direction !== 'request' || typeof candidate.requestId !== 'string') return;
    const respond = (response: BridgeResponse): void => target.postMessage(response, location.origin);
    if (!isAcademicToolName(candidate.operation)) {
      respond({ channel: BRIDGE_CHANNEL, direction: 'response', requestId: candidate.requestId, ok: false, error: 'Unknown academic operation' });
      return;
    }
    if (!isBridgeRequest(event.data)) {
      respond({ channel: BRIDGE_CHANNEL, direction: 'response', requestId: candidate.requestId, ok: false, error: 'Malformed bridge request' });
      return;
    }
    void getContext().then((context) => {
      try {
        const result = executeAcademicTool(event.data.operation, event.data.input, context);
        respond({ channel: BRIDGE_CHANNEL, direction: 'response', requestId: event.data.requestId, ok: true, result });
      } catch (error) {
        respond({ channel: BRIDGE_CHANNEL, direction: 'response', requestId: event.data.requestId, ok: false, error: error instanceof Error ? error.message : 'Academic operation failed' });
      }
    }).catch(() => respond({ channel: BRIDGE_CHANNEL, direction: 'response', requestId: event.data.requestId, ok: false, error: 'Academic state unavailable' }));
  };
  target.addEventListener('message', listener);
  return () => target.removeEventListener('message', listener);
}
