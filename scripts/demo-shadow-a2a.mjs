/* global process, fetch, setTimeout */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const peers = [
  ['student-a', '9101'],
  ['student-b', '9102'],
  ['student-c', '9103']
];
const scenario = process.argv[2] ?? 'happy-path';
const mode = process.argv[3] ?? 'initial';
const peerEntry = resolve('apps/shadow-cohort-peer/src/cli.ts');
const coordinatorEntry = resolve(`apps/shadow-cohort-coordinator/src/${mode === 'replan' ? 'replan-demo' : 'demo'}.ts`);
const children = peers.map(([id, port]) => spawn(process.execPath, ['--import', 'tsx', peerEntry, id, port, scenario], { cwd: process.cwd(), stdio: 'inherit' }));

async function waitForPeers() {
  const deadline = Date.now() + 15_000;
  for (const [, port] of peers) {
    const url = `http://127.0.0.1:${port}/.well-known/agent-card.json`;
    while (Date.now() < deadline) {
      try { if ((await fetch(url)).ok) break; } catch { /* peer is still starting */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    try {
      if (!(await fetch(url)).ok) throw new Error('not ready');
    } catch { throw new Error(`A2A peer did not become ready: ${url}`); }
  }
}

try {
  await waitForPeers();
  const coordinator = spawn(process.execPath, ['--import', 'tsx', coordinatorEntry], { cwd: process.cwd(), stdio: 'inherit' });
  const exitCode = await new Promise((resolveExit) => coordinator.once('exit', resolveExit));
  if (exitCode !== 0) throw new Error(`Coordinator exited with code ${String(exitCode)}.`);
} finally {
  for (const child of children) child.kill('SIGTERM');
}
