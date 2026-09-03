import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The production extension build uses build.mjs so manifest content scripts are emitted as standalone IIFEs.
export default defineConfig({
  build: {
    outDir: 'dist', emptyOutDir: true,
    rollupOptions: {
      input: { popup: resolve(import.meta.dirname, 'popup.html') },
      output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' }
    }
  }
});
