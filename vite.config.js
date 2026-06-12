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
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendor code out of the app chunk so that:
        //   1. the chart library (recharts + its d3 deps) is cached separately and
        //      survives every app/data redeploy, and
        //   2. the browser fetches react / charts / app in parallel on first load.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('recharts') ||
            id.includes('/d3-') ||
            id.includes('victory-vendor') ||
            id.includes('internmap') ||
            id.includes('react-smooth') ||
            id.includes('decimal.js-light')
          ) {
            return 'charts';
          }
          if (
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/react-is/') ||
            id.includes('/scheduler/')
          ) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
});