import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  envDir: false,
  define: { __BUILD_ID__: JSON.stringify('e2e') },
  plugins: [{
    name: 'e2e-only-firebase-fixtures',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'firebase/ai' && importer?.endsWith('/src/services/aiLogicService.ts')) return this.resolve('/e2e/mock-ai.mjs');
      if (id.endsWith('/firebase') && importer?.includes('/src/')) return this.resolve('/e2e/mock-firebase.mjs');
    },
  }, react(), tailwind()],
});
