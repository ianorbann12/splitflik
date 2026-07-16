import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev/build config. Tests use vitest.config.ts (node env) — kept separate
// so the React plugin never touches the engine/api unit tests.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
});
