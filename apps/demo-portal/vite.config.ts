import { defineConfig } from 'vite';

const headers = { 'Origin-Agent-Cluster': '?1' };
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true, headers },
  preview: { port: 4173, headers }
});
