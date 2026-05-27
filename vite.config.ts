import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/v1': {
        target: process.env.VITE_GATEWAY_URL || 'http://localhost:8090',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_HONEYCOMB_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
