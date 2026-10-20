/**
 * Safe, network-only release check. A build ID is the identity of the
 * deployed *website*, not an Australis OS version.
 */
export function parsePublishedBuild(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (typeof data.buildId !== 'string' || !/^[A-Za-z0-9._-]{6,128}$/.test(data.buildId)) return null
  if (typeof data.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(data.version)) return null
  return { buildId: data.buildId, version: data.version }
}

export function isNewBuild(currentId, candidate) {
  return typeof currentId === 'string' && currentId.length > 0 &&
    !!candidate && candidate.buildId !== currentId
}

export async function fetchPublishedBuild(fetcher, baseUrl, { signal, nonce = Date.now() } = {}) {
  // The query avoids old cache-first SW versions and browser HTTP caches.
  const url = `${baseUrl.replace(/\/?$/, '/')}version.json?update=${encodeURIComponent(nonce)}`
  const response = await fetcher(url, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null
  return parsePublishedBuild(await response.json())
}

/**
 * Start a network-first reload. This cannot silently delete diagnostic state:
 * the caller must request user confirmation before invoking this function.
 */
export async function applyWebsiteUpdate({ navigatorObject, locationObject, buildId }) {
  if (navigatorObject?.serviceWorker) {
    try {
      const registration = await navigatorObject.serviceWorker.getRegistration()
      await registration?.update()
    } catch { /* Reload still refreshes a normal network-first navigation. */ }
  }
  const url = new URL(locationObject.href)
  url.searchParams.set('website-update', buildId)
  locationObject.replace(url.href)
}
