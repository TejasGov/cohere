export {};
declare global {
  interface ModelContextTool {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, { type: 'string'; description?: string }>; required?: string[]; additionalProperties: false };
    execute(input: unknown): Promise<unknown>;
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  }
  interface ModelContext {
    registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void>;
    getTools?(): Promise<Array<{ name: string }>>;
  }
  interface Document { readonly modelContext?: ModelContext; }
}
