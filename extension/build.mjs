import { resolve } from 'node:path';
import { build } from 'vite';

const root = import.meta.dirname;
const output = resolve(root, 'dist');

await build({
  configFile: false,
  root,
  build: {
    outDir: output,
    emptyOutDir: true,
    rollupOptions: {
      input: { popup: resolve(root, 'popup.html') },
      output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' }
    }
  }
});

for (const entry of [
  { name: 'AcademicExtensionContent', source: 'src/content.ts', file: 'assets/content.js' },
  { name: 'AcademicWebMcpMain', source: 'src/webmcp/main.ts', file: 'assets/webmcp-main.js' }
]) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    build: {
      outDir: output,
      emptyOutDir: false,
      lib: { entry: resolve(root, entry.source), name: entry.name, formats: ['iife'], fileName: () => entry.file },
      rollupOptions: { output: { assetFileNames: 'assets/[name]-[hash][extname]' } }
    }
  });
}
