import { defineConfig } from 'vite';

// Honor the PORT env var (set by the harness when autoPort assigns a free port),
// falling back to Vite's default 5173.
export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
});
