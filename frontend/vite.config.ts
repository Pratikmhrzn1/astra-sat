import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/sat/',
  plugins: [react()],
  // '@' points at src/, so modules import by their place in the architecture
  // ('@/shared/ui/Button') rather than by their distance from it ('../../..').
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
