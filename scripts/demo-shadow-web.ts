import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { ShadowCohortServer } from '../apps/shadow-cohort-server/src/server';

const API_URL = 'http://127.0.0.1:9200';
const DASHBOARD_URL = 'http://127.0.0.1:5173/dashboard';

async function waitForUrl(url: string, label: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* Service is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms.`);
}

console.log('SHADOW COHORT LOCAL DEMO\n');
const server = new ShadowCohortServer({
  host: '127.0.0.1',
  port: 9200,
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  log: (message) => console.log(message)
});
let dashboard: ChildProcess | undefined;
let shuttingDown = false;

async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  dashboard?.kill('SIGTERM');
  await server.stop();
  process.exitCode = exitCode;
}

async function main(): Promise<void> {
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });

  try {
    await server.start();
    await waitForUrl(`${API_URL}/api/shadow/status`, 'Coordinator API');
    console.log(`✓ Coordinator ready on ${String(server.publicPort)}`);
    console.log('\nStarting dashboard...');
    dashboard = spawn(process.execPath, [resolve('apps/demo-portal/node_modules/vite/bin/vite.js')], {
      cwd: resolve('apps/demo-portal'),
      env: { ...process.env, VITE_SHADOW_API_BASE: API_URL },
      stdio: 'inherit'
    });
    await waitForUrl(DASHBOARD_URL, 'Dashboard');
    console.log('✓ Dashboard ready');
    console.log(`\nOPEN:\n${DASHBOARD_URL}\n\nShadow Cohort local demo is ready.`);
    const exitCode = await new Promise<number>((resolveExit) => dashboard?.once('exit', (code) => resolveExit(code ?? 0)));
    await shutdown(exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Local demo failed to start.');
    await shutdown(1);
  }
}

void main();
