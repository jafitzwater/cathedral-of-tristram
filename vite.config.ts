import { defineConfig } from 'vite';

// Project site: https://jafitzwater.github.io/cathedral-of-tristram/
// Asset URLs are prefixed so the static build works under that base path.
export default defineConfig({
  base: '/cathedral-of-tristram/',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
