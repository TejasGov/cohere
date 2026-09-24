import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ShadowCoordinatorRuntime } from './runtime-service';

const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const METHODS = 'GET,POST,OPTIONS';
const HEADERS = 'Content-Type';

export interface DashboardApiOptions {
  allowedOrigins?: string[];
  host?: string;
  port?: number;
}

export interface RunningDashboardApi {
  endpoint: string;
  host: string;
  port: number;
  server: Server;
  stop(): Promise<void>;
}

export function parseAllowedOrigins(value = process.env['SHADOW_ALLOWED_ORIGINS']): string[] {
  return [...new Set([
    ...LOCAL_ORIGINS,
    ...(value ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
  ])];
}

function action(handler: (request: Request) => Promise<unknown> | unknown) {
  return async (request: Request, response: Response): Promise<void> => {
    try { response.json(await handler(request)); }
    catch (error) { response.status(409).json({ error: error instanceof Error ? error.message : 'Operation failed.' }); }
  };
}

function cors(allowedOrigins: ReadonlySet<string>) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.header('origin');
    response.setHeader('Vary', 'Origin');
    if (origin && !allowedOrigins.has(origin)) {
      response.status(403).json({ error: 'Origin is not allowed.' });
      return;
    }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', METHODS);
    response.setHeader('Access-Control-Allow-Headers', HEADERS);
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  };
}

export function createDashboardApi(runtime: ShadowCoordinatorRuntime, options: DashboardApiOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(new Set(options.allowedOrigins ?? parseAllowedOrigins())));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', action(() => runtime.getHealth()));
  app.get('/api/shadow/health', action(() => runtime.getHealth()));
  app.get('/api/shadow/status', action(() => runtime.getStatus()));
  app.post('/api/shadow/negotiate', action(() => runtime.negotiate()));
  app.post('/api/shadow/plan/approve', action(() => runtime.approveCurrentPlan()));
  app.post('/api/shadow/demo/student-c-overload', action(() => runtime.simulateStudentCOverload()));
  app.post('/api/shadow/demo/reset', action(() => runtime.resetDemo()));
  app.post('/api/shadow/replan/approve', action(() => runtime.approveReplan()));
  app.post('/api/shadow/replan/reject', action((request) => runtime.rejectReplan(typeof request.body?.feedback === 'string' ? request.body.feedback : undefined)));
  return app;
}

export async function startDashboardApi(runtime: ShadowCoordinatorRuntime, portOrOptions: number | DashboardApiOptions = 9200): Promise<RunningDashboardApi> {
  const options = typeof portOrOptions === 'number' ? { port: portOrOptions } : portOrOptions;
  const port = options.port ?? 9200;
  const host = options.host ?? '127.0.0.1';
  const app = createDashboardApi(runtime, options);
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  const reachableHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return {
    endpoint: `http://${reachableHost}:${address.port}`,
    host,
    port: address.port,
    server,
    stop: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
