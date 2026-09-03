import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACADEMIC_TOOL_DEFINITIONS } from './definitions';
import { registerAcademicWebMcpTools, stopAcademicWebMcpTools } from './runtime';

function setModelContext(value: ModelContext | undefined): void {
  Object.defineProperty(document, 'modelContext', { value, configurable: true });
}
afterEach(() => { stopAcademicWebMcpTools(); setModelContext(undefined); vi.restoreAllMocks(); });

describe('native WebMCP runtime', () => {
  it('reports an unsupported browser without pretending tools registered', async () => {
    setModelContext(undefined);
    await expect(registerAcademicWebMcpTools()).resolves.toMatchObject({ supported: false, registeredTools: [] });
  });
  it('registers successful, unique definitions with valid object schemas', async () => {
    const registered: ModelContextTool[] = [];
    setModelContext({ registerTool: vi.fn(async (tool: ModelContextTool) => { registered.push(tool); }) });
    const bridge = { request: vi.fn(async () => ({ ok: true })) };
    const status = await registerAcademicWebMcpTools(bridge as never);
    expect(status.supported).toBe(true);
    expect(status.bridgeConnected).toBe(true);
    expect(status.registeredTools).toHaveLength(7);
    expect(new Set(registered.map((tool) => tool.name)).size).toBe(registered.length);
    expect(registered.every((tool) => tool.inputSchema.type === 'object' && tool.inputSchema.additionalProperties === false)).toBe(true);
    expect(registered.every((tool) => tool.annotations?.readOnlyHint && tool.annotations.untrustedContentHint)).toBe(true);
  });
  it('avoids duplicate registration when initialization is requested twice', async () => {
    const registerTool = vi.fn(async () => undefined);
    setModelContext({ registerTool });
    const bridge = { request: vi.fn(async () => ({})) };
    await Promise.all([registerAcademicWebMcpTools(bridge as never), registerAcademicWebMcpTools(bridge as never)]);
    expect(registerTool).toHaveBeenCalledTimes(ACADEMIC_TOOL_DEFINITIONS.length);
  });
});
