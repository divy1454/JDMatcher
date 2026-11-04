import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * The floating widget (content.js) is a classic content script: Chrome can't run `import` statements in it.
 * The popup uses the same App, so in the main build Vite moves App into a shared chunk and content.js starts
 * with `import ... from "./App.js"`, which fails on every page. This second build makes content.js one
 * self-contained file.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/index.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        assetFileNames: 'content.[ext]',
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
