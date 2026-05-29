import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Per-market JSON is dynamically imported, so Vite code-splits each market
    // into its own chunk that loads only when that market is selected.
    chunkSizeWarningLimit: 1500,
  },
});
