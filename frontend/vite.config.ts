import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [mkcert(), react()],
  resolve: {
    alias: {
      '#app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '#pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
      '#widgets': fileURLToPath(new URL('./src/widgets', import.meta.url)),
      '#entities': fileURLToPath(new URL('./src/entities', import.meta.url)),
      '#shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '#assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    globals: true,
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
