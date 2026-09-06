import { peerFixture } from './fixtures';
import { startPeerServer } from './server';

const id = process.argv[2];
const port = Number(process.argv[3]);
if (!id || !Number.isInteger(port)) throw new Error('Usage: cli.ts <student-a|student-b|student-c> <port>');
const peer = await startPeerServer({ ...peerFixture(id), port });
console.log(`${peer.descriptor.displayName} A2A peer RUNNING at ${peer.descriptor.endpoint}`);
await new Promise<void>((resolve) => {
  const stop = (): void => { peer.stop(); resolve(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
});
