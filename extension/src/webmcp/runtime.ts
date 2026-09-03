import { AcademicBridgeClient } from './bridge-client';
import { ACADEMIC_TOOL_DEFINITIONS } from './definitions';

export interface WebMcpStatus {
  modelContextAvailable: boolean;
  registerToolAvailable: boolean;
  supported: boolean;
  bridgeConnected: boolean;
  expectedTools: string[];
  registeredTools: string[];
  registrationErrors: string[];
}
const initialStatus = (): WebMcpStatus => ({
  modelContextAvailable: document.modelContext !== undefined,
  registerToolAvailable: typeof document.modelContext?.registerTool === 'function',
  supported: typeof document.modelContext?.registerTool === 'function', bridgeConnected: false,
  expectedTools: ACADEMIC_TOOL_DEFINITIONS.map((tool) => tool.name), registeredTools: [], registrationErrors: []
});
let lifecycle: AbortController | undefined;
let starting: Promise<WebMcpStatus> | undefined;

export async function registerAcademicWebMcpTools(client = new AcademicBridgeClient()): Promise<WebMcpStatus> {
  if (starting) return starting;
  starting = (async () => {
    const status = initialStatus();
    if (!status.supported || !document.modelContext) return status;
    try { await client.request('academic_get_overview', {}); status.bridgeConnected = true; }
    catch { status.registrationErrors.push('Academic bridge unavailable'); return status; }
    lifecycle?.abort();
    lifecycle = new AbortController();
    for (const definition of ACADEMIC_TOOL_DEFINITIONS) {
      try {
        await document.modelContext.registerTool({
          ...definition,
          execute: async (input: unknown) => {
            const result = await client.request(definition.name, input);
            return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true }
        }, { signal: lifecycle.signal });
        status.registeredTools.push(definition.name);
      } catch { status.registrationErrors.push(definition.name); }
    }
    return status;
  })();
  return starting;
}
export function stopAcademicWebMcpTools(): void { lifecycle?.abort(); lifecycle = undefined; starting = undefined; }
