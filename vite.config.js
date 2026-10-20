import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Set GITHUB_PAGES_BASE=/repo-name/ for a GitHub project page.
// The GitHub Actions workflow sets this automatically.
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'australis-offline-precache',
      apply: 'build',
      generateBundle(_options, bundle) {
        // The service worker installs after the first page load. Give it all
        // fingerprinted JS/CSS assets so the very next launch works offline.
        const assets = [
          ...Object.keys(bundle),
          'favicon.svg',
          'manifest.webmanifest',
          'sample-panic-qr.png',
        ]
        this.emitFile({
          type: 'asset',
          fileName: 'precache-manifest.json',
          source: JSON.stringify([...new Set(assets)]),
        })
      },
    },
  ],
  base: process.env.GITHUB_PAGES_BASE || '/',
})
