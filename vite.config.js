import { defineConfig } from 'vite';

// Relative base so the built files load from disk inside Electron.
export default defineConfig({
  base: './',
  server: { port: 5173 },
});
