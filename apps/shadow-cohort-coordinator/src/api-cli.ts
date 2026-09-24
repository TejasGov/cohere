import { campusMarketplaceProject, defaultPeers } from './project';
import { ShadowCoordinatorRuntime } from './runtime-service';
import { startDashboardApi } from './api';

const port = Number(process.env['SHADOW_DASHBOARD_PORT'] ?? 9200);
const runtime = new ShadowCoordinatorRuntime(campusMarketplaceProject, defaultPeers);
const api = await startDashboardApi(runtime, { port, allowedOrigins: undefined });

console.log(`Shadow Cohort dashboard API listening at ${api.endpoint}`);
console.log('Start the three happy-path peers first in separate terminals with: pnpm shadow:peer:a, pnpm shadow:peer:b, and pnpm shadow:peer:c');

const stop = (): void => {
  void api.stop().finally(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
