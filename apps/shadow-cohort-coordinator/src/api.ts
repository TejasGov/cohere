import express, { type Express, type Request, type Response } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ShadowCoordinatorRuntime } from './runtime-service';

function action(handler: (request: Request) => Promise<unknown> | unknown) {
  return async (request: Request, response: Response): Promise<void> => {
    try { response.json(await handler(request)); }
    catch (error) { response.status(409).json({ error: error instanceof Error ? error.message : 'Operation failed.' }); }
  };
}

export function createDashboardApi(runtime: ShadowCoordinatorRuntime): Express {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/shadow/status', action(() => runtime.getStatus()));
  app.post('/api/shadow/negotiate', action(() => runtime.negotiate()));
  app.post('/api/shadow/plan/approve', action(() => runtime.approveCurrentPlan()));
  app.post('/api/shadow/demo/student-c-overload', action(() => runtime.simulateStudentCOverload()));
  app.post('/api/shadow/replan/approve', action(() => runtime.approveReplan()));
  app.post('/api/shadow/replan/reject', action((request) => runtime.rejectReplan(typeof request.body?.feedback === 'string' ? request.body.feedback : undefined)));
  return app;
}

export async function startDashboardApi(runtime: ShadowCoordinatorRuntime, port = 9200): Promise<{ endpoint: string; server: Server; stop(): Promise<void> }> {
  const app = createDashboardApi(runtime);
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(port, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return { endpoint: `http://127.0.0.1:${address.port}`, server, stop: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
