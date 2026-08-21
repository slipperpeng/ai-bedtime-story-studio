import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 8899,
    open: false,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 8899,
    cors: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
})
