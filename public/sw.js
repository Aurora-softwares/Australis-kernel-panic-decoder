/* Only publicly published same-origin app assets are cached. Never cache scans, user uploads or raw panic text. */
const CACHE = 'australis-panic-decoder-v10'
const PREFIX = 'australis-panic-decoder-'
const ROOT = new URL('./', self.registration.scope).href
const knownDB = `${ROOT}known-issues/index.json`

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(`${ROOT}precache-manifest.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error('App asset manifest unavailable')
    const assets = await response.json()
    if (!Array.isArray(assets) || assets.some(asset => typeof asset !== 'string' || asset.includes('..') || asset.startsWith('/'))) {
      throw new Error('Unexpected asset manifest')
    }
    const cache = await caches.open(CACHE)
    await cache.addAll([ROOT, `${ROOT}precache-manifest.json`, ...assets.map(asset => `${ROOT}${asset}`)])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]))
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return
  // Browser navigation: update when online, fall back to the cached app shell.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok && url.pathname === new URL(ROOT).pathname) {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(ROOT, copy)))
      }
      return response
    }).catch(async () => (await caches.match(ROOT)) || Response.error()))
    return
  }
  // Public issue list and public symbol map can refresh online and work from cache offline.
  const isPublicLookup = url.href === knownDB || url.pathname.startsWith(new URL('symbols/', ROOT).pathname)
  if (isPublicLookup) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)))
      }
      return response
    }).catch(async () => (await caches.match(event.request)) || Response.error()))
    return
  }
  // The manifest's published assets were already explicitly pre-cached at install.
  // No opportunistic caching of unknown URLs or user-supplied data.
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)))
})
