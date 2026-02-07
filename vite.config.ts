import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
});
