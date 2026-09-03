import { defineConfig } from 'vite';

const headers = { 'Origin-Agent-Cluster': '?1' };
export default defineConfig({
  server: { port: 5173, headers },
  preview: { port: 4173, headers }
});
