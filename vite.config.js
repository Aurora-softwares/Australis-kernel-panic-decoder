import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
// An ID changes whenever Release publishes, even when the display version does not.
const buildId = process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || `local-${Date.now()}`

// GitHub Pages sets GITHUB_PAGES_BASE=/repository/; Cloudflare uses /.
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'australis-offline-precache',
      apply: 'build',
      generateBundle(_options, bundle) {
        const assets = [
          ...Object.keys(bundle),
          'favicon.svg',
          'icon-192.png',
          'icon-512.png',
          'manifest.webmanifest',
          'sample-panic-qr.png',
          'sample-au1-qr.png',
          'sample-au1-qr.pgm',
          'sample-au1-crash-qr.png',
          'sample-au1-crash-qr.pgm',
          'known-issues/index.json',
        ]
        this.emitFile({
          type: 'asset',
          fileName: 'precache-manifest.json',
          source: JSON.stringify([...new Set(assets)]),
        })
        // Intentionally NOT pre-cached. This must be fetched from the network.
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version, buildId }),
        })
      },
      writeBundle() {
        // Always alter the service worker bytes for a new deployment so the
        // browser installs and pre-caches the corresponding production assets.
        const path = resolve('dist', 'sw.js')
        const worker = readFileSync(path, 'utf8')
        if (!worker.includes('__BUILD_ID__')) throw new Error('Missing service-worker build placeholder')
        writeFileSync(path, worker.replaceAll('__BUILD_ID__', buildId))
      },
    },
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_VERSION__: JSON.stringify(version),
  },
  base: process.env.GITHUB_PAGES_BASE || '/',
})
