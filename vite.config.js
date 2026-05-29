import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    // Per-market JSON is dynamically imported, so Vite code-splits each market
    // into its own chunk that loads only when that market is selected.
    chunkSizeWarningLimit: 1500,
  },
});