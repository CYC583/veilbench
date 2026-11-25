import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Build identity (T-13): short git SHA when available, plus UTC build time; shown in the page footer
 *  and greppable in the deployed bundle so a stale production deploy is obvious. */
function resolveBuildId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `${sha}-${stamp}`;
  } catch {
    return `nogit-${stamp}`;
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  build: {
    // Two chunks sit just above 500 kB and are single libraries: Firestore (needed at start for the offline
    // cache) and pdf.js (loaded only when a PDF is opened). Everything else is split per service below.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split vendors by service so no chunk exceeds 500 kB and each caches independently.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          // Keep each wrapper (firebase/x) with its implementation (@firebase/x): splitting them creates a
          // circular chunk import that breaks module initialization order in production.
          if (/[\\/]@?firebase[\\/]firestore/.test(id)) return 'firebase-firestore';
          if (/[\\/](?:@firebase|firebase)[\\/]/.test(id) || id.includes('/idb/')) return 'firebase-core';
          if (/[\\/](?:react|react-dom|scheduler|lucide-react)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
