import { ACADEMIC_TOOL_NAMES, type AcademicToolName } from './tools';
export const BRIDGE_CHANNEL = 'academic-webmcp-bridge-v1';
export type BridgeRequest = { channel: typeof BRIDGE_CHANNEL; direction: 'request'; requestId: string; operation: AcademicToolName; input: unknown };
export type BridgeResponse = { channel: typeof BRIDGE_CHANNEL; direction: 'response'; requestId: string; ok: true; result: unknown } | { channel: typeof BRIDGE_CHANNEL; direction: 'response'; requestId: string; ok: false; error: string };
export function isAcademicToolName(value: unknown): value is AcademicToolName { return typeof value === 'string' && ACADEMIC_TOOL_NAMES.includes(value as AcademicToolName); }
export function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<BridgeRequest>;
  return item.channel === BRIDGE_CHANNEL && item.direction === 'request' && typeof item.requestId === 'string' && item.requestId.length > 0 && isAcademicToolName(item.operation);
}
export function isBridgeResponse(value: unknown): value is BridgeResponse {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return item.channel === BRIDGE_CHANNEL && item.direction === 'response' && typeof item.requestId === 'string' && typeof item.ok === 'boolean' && (item.ok || typeof item.error === 'string');
}

