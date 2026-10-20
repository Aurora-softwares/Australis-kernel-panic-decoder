/**
 * Resolve faulting instruction addresses only against explicitly published,
 * commit-pinned *public* Australis OS source maps. No guesses and no GitHub
 * network request on scan. All maps are served by our own static site.
 *
 * AUP1;b=<build-id>;kb=<runtime code start>;ip=<RIP> or text BUILD/KBASE/RIP.
 * Entry offsets are relative to the *first executable kernel code byte*, not
 * the 16-byte AUKR header or the start of the allocation.
 */

export const PUBLIC_SOURCE_REPO = 'Aurora-softwares/Australis-OS'
const SHA = /^[0-9a-f]{40}$/i
const BUILD = /^[a-z0-9][a-z0-9._-]{5,63}$/i
const PATH = /^src\/kernel\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.hy$/
const MAX_SOURCE_LINES = 9

export function parseAddress(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null
  const text = String(input).trim()
  if (!/^(?:0x[\da-f]+|\d+)$/i.test(text)) return null
  try {
    const value = BigInt(text)
    return value >= 0n && value <= 0xffffffffffffffffn ? value : null
  } catch { return null }
}

function publicEntry(raw, meta) {
  if (!raw || !PATH.test(raw.path) || !Number.isSafeInteger(raw.line) || raw.line < 1 || raw.line > 1000000) return null
  if (!['line', 'function'].includes(raw.precision)) return null
  const start = parseAddress(raw.start)
  const end = parseAddress(raw.end)
  if (start === null || end === null || end <= start) return null
  if (!Array.isArray(raw.snippet) || raw.snippet.length === 0 || raw.snippet.length > MAX_SOURCE_LINES ||
    !raw.snippet.every(s => typeof s === 'string' && s.length <= 200 && !s.includes('\n') && !s.includes('\r'))) return null
  if (!Number.isSafeInteger(raw.snippetStart) || raw.snippetStart < 1 || raw.snippetStart > raw.line || raw.line >= raw.snippetStart + raw.snippet.length) return null
  const symbol = typeof raw.symbol === 'string' && /^[A-Za-z_][A-Za-z0-9_.:]{0,95}$/.test(raw.symbol) ? raw.symbol : null
  const url = `https://github.com/${PUBLIC_SOURCE_REPO}/blob/${meta.commit}/${raw.path}#L${raw.line}`
  return { start, end, file: raw.path, line: raw.line, precision: raw.precision, symbol, snippet: raw.snippet, snippetStart: raw.snippetStart, url, commit: meta.commit, build: meta.build }
}

function verifiedMap(map, build) {
  if (!map || map.schema !== 1 || map.build !== build || map.repository !== PUBLIC_SOURCE_REPO || !SHA.test(map.commit) || !Array.isArray(map.entries) || map.entries.length > 200000) return null
  const entries = map.entries.map(raw => publicEntry(raw, map))
  if (entries.some(e => !e)) return null
  entries.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0)
  if (entries.some((e, i) => i > 0 && entries[i - 1].end > e.start)) return null
  const fixedCodeBase = map.fixedCodeBase == null ? null : parseAddress(map.fixedCodeBase)
  if (map.fixedCodeBase != null && fixedCodeBase === null) return null
  return { build, entries, fixedCodeBase }
}

/**
 * status: matched | no-rip | no-build | unavailable | no-base | not-found | error.
 * Call on each diagnosis; fetch only same-origin static JSON after explicit
 * build identification. A failed or ambiguous mapping never returns a snippet.
 */
export async function lookupSource(result, fetchImpl = fetch, root = '/', signal) {
  if (!result?.valid) return { status: 'unavailable' }
  const rip = parseAddress(result.fields?.RIP)
  if (rip === null) return { status: 'no-rip' }
  const build = String(result.fields?.BUILD || '').trim()
  if (!BUILD.test(build)) return { status: 'no-build' }

  // Disallow absolute URLs, path traversal or a user-controlled remote origin.
  const base = String(root).startsWith('/') && !String(root).startsWith('//') && !String(root).includes('..') ? String(root) : '/'
  const path = `${base.replace(/\/?$/, '/') }symbols/`
  try {
    const manifestResponse = await fetchImpl(`${path}index.json`, { signal, credentials: 'omit' })
    if (!manifestResponse.ok) return { status: 'unavailable' }
    const manifest = await manifestResponse.json()
    if (manifest?.schema !== 1 || !Array.isArray(manifest.builds) || manifest.builds.length > 500 || !manifest.builds.includes(build)) return { status: 'unavailable' }
    const mapResponse = await fetchImpl(`${path}${encodeURIComponent(build)}.json`, { signal, credentials: 'omit' })
    if (!mapResponse.ok) return { status: 'unavailable' }
    const map = verifiedMap(await mapResponse.json(), build)
    if (!map) return { status: 'error' }
    const providedBase = result.fields?.KBASE ? parseAddress(result.fields.KBASE) : null
    if (result.fields?.KBASE && providedBase === null) return { status: 'no-base' }
    const codeBase = providedBase ?? map.fixedCodeBase
    if (codeBase === null) return { status: 'no-base' }
    if (rip < codeBase) return { status: 'not-found' }
    const offset = rip - codeBase
    const matches = map.entries.filter(e => e.start <= offset && offset < e.end)
    if (matches.length !== 1) return { status: 'not-found' }
    const { start, end, ...entry } = matches[0]
    return { status: 'matched', location: { ...entry, offset: `0x${offset.toString(16)}` } }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return { status: 'error' }
  }
}

/** Validates once more before code is allowed into a public issue URL. */
export function issueSafeSource(source) {
  if (source?.status !== 'matched') return null
  const location = source.location
  if (!location || !SHA.test(location.commit) || !BUILD.test(location.build)) return null
  const validated = publicEntry({
    start: '0x0', end: '0x1', path: location.file, line: location.line,
    precision: location.precision, snippet: location.snippet,
    snippetStart: location.snippetStart, symbol: location.symbol,
  }, { commit: location.commit, build: location.build })
  return validated
}
