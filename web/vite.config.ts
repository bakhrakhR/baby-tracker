import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The app is deployed to GitHub Pages under /baby-tracker/, so assets must be
// referenced with that base. The dev server also serves under this base.
// https://vite.dev/config/
export default defineConfig({
  base: '/baby-tracker/',
  plugins: [svelte()],
})
