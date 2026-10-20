/* Cache only same-origin application assets, never panic payloads or uploads. */
const CACHE = 'australis-panic-decoder-v7'
const ROOT = new URL('./', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const manifestResponse = await fetch(`${ROOT}precache-manifest.json`, { cache: 'no-store' })
    if (!manifestResponse.ok) throw new Error('Precache manifest unavailable')
    const assets = await manifestResponse.json()
    const cache = await caches.open(CACHE)
    await cache.addAll([ROOT, `${ROOT}precache-manifest.json`, ...assets.map((asset) => `${ROOT}${asset}`)])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]))
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return
  // Try network first for the application page; use cached HTML offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(ROOT, copy))
      }
      return response
    }).catch(() => caches.match(ROOT)))
    return
  }
  if (url.pathname.startsWith(new URL('symbols/', ROOT).pathname)) {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then(cache => cache.put(event.request, copy))
      }
      return response
    }).catch(() => caches.match(event.request)))
    return
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put(event.request, copy))
    }
    return response
  })))
})
