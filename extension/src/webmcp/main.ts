import { registerAcademicWebMcpTools, stopAcademicWebMcpTools, type WebMcpStatus } from './runtime';
import { BRIDGE_CHANNEL } from './protocol';

let latestStatus: WebMcpStatus | undefined;
function publish(status: WebMcpStatus): void {
  latestStatus = status;
  window.postMessage({ channel: BRIDGE_CHANNEL, direction: 'status', status }, location.origin);
}
void registerAcademicWebMcpTools().then(publish);
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source === window && event.origin === location.origin && event.data?.channel === BRIDGE_CHANNEL && event.data?.direction === 'status-request' && latestStatus) publish(latestStatus);
});
window.addEventListener('pagehide', stopAcademicWebMcpTools, { once: true });
