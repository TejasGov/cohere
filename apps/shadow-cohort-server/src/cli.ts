import { parseAllowedOrigins } from '@shadow-cohort/coordinator';
import { ShadowCohortServer } from './server';

function portFromEnvironment(): number {
  const value = Number(process.env['PORT']) || 9200;
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error('PORT must be an integer from 1 to 65535.');
  return value;
}

console.log('SHADOW COHORT SERVER\n');
const server = new ShadowCohortServer({
  port: portFromEnvironment(),
  host: '0.0.0.0',
  allowedOrigins: parseAllowedOrigins(),
  log: (message) => console.log(message)
});

try {
  await server.start();
  console.log(`\nA2A peers: ${server.peerCount}/3 connected`);
  console.log(`Public API: 0.0.0.0:${String(server.publicPort)}`);
  console.log('\nSHADOW COHORT READY');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Shadow Cohort failed to start.');
  process.exitCode = 1;
}

let shutdownStarted = false;
const shutdown = (signal: string): void => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`\n${signal} received; stopping Shadow Cohort...`);
  void server.stop().finally(() => process.exit(process.exitCode ?? 0));
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
