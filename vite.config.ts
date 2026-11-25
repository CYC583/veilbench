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
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: [
            'firebase/app',
            'firebase/ai',
            'firebase/app-check',
            'firebase/auth',
            'firebase/firestore',
            'firebase/remote-config',
          ],
          react: ['react', 'react-dom', 'lucide-react'],
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
