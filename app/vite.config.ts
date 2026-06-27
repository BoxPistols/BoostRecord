import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' makes built asset URLs relative, which is required when Electron
// loads dist/index.html over file:// in the packaged app.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()]
})
