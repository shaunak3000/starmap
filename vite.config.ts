import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites under /<repo>/, so the deploy workflow
  // sets BASE_PATH. Left at "/" everywhere else so dev and local previews are
  // unaffected. The catalogue loader reads import.meta.env.BASE_URL, so the
  // binary tiers follow automatically.
  base: process.env.BASE_PATH || '/',
  build: {
    target: 'es2022',
  },
})
