/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Learn's lessons live in ../content (one folder per language) and are bundled into the app.
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'happy-dom',
    restoreMocks: true,
  },
})
