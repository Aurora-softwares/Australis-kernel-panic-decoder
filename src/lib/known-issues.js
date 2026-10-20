/** Conservative curated issue matches; safe, same-origin JSON only. */
import { parseAddress, PUBLIC_SOURCE_REPO } from './source-lookup.js'
export const KNOWN_DB_PATH = 'known-issues/index.json'
const BUILD = /^[a-z0-9][a-z0-9._-]{5,63}$/i
const VALID_STATUSES = new Set(['known', 'investigating', 'resolved'])
const ISSUE_SITE = `https://github.com/${PUBLIC_SOURCE_REPO}/issues/`
const MAX_ITEMS = 500

export function crashSignature(result) {
  if (!result?.valid || !Number.isInteger(result.vector) || result.vector < 0 || result.vector > 255) return null
  const build = String(result.fields?.BUILD || '').trim()
  if (!BUILD.test(build)) return null
  const rip = parseAddress(result.fields?.RIP)
  const codeBase = parseAddress(result.fields?.KBASE)
  if (rip === null || codeBase === null || rip < codeBase) return null
  const offset = rip - codeBase
  // A page-fault access code can affect diagnosis: include the low five bits.
  const error = result.vector === 14 ? parseAddress(result.fields?.ERROR) : 0n
  if (error === null) return null
  return `sig1:${build.toLowerCase()}:v${result.vector}:o${offset.toString(16)}:e${(error & 31n).toString(16)}`
}

function safeItem(item) {
  if (!item || typeof item !== 'object' || !VALID_STATUSES.has(item.status) ||
    typeof item.signature !== 'string' || !/^sig1:[a-z0-9._-]{6,64}:v\d{1,3}:o[0-9a-f]+:e[0-9a-f]+$/.test(item.signature) ||
    !Number.isSafeInteger(item.issue) || item.issue < 1 ||
    typeof item.title !== 'string' || item.title.length < 3 || item.title.length > 140 ||
    typeof item.summary !== 'string' || item.summary.length > 500 ||
    typeof item.recovery !== 'string' || item.recovery.length > 500) return null
  return {
    signature: item.signature, status: item.status, issue: item.issue,
    title: item.title, summary: item.summary, recovery: item.recovery,
    url: `${ISSUE_SITE}${item.issue}`,
  }
}

/** This is a public site asset; checked automatically, without sending raw QR data. */
export async function lookupKnownIssue(result, fetchImpl = fetch, root = '/', signal) {
  const signature = crashSignature(result)
  if (!signature) return { status: 'not-enough-data', match: null }
  const base = String(root).startsWith('/') && !String(root).startsWith('//') && !String(root).includes('..')
    ? String(root).replace(/\/?$/, '/') : '/'
  try {
    const response = await fetchImpl(`${base}${KNOWN_DB_PATH}`, { signal, credentials: 'omit' })
    if (!response.ok) return { status: 'unavailable', match: null }
    const data = await response.json()
    if (data?.schema !== 1 || data?.repository !== PUBLIC_SOURCE_REPO || !Array.isArray(data.issues) || data.issues.length > MAX_ITEMS) {
      return { status: 'unavailable', match: null }
    }
    const records = data.issues.map(safeItem)
    if (records.some(x => !x)) return { status: 'unavailable', match: null }
    const matches = records.filter(r => r.signature === signature)
    // Duplicate signatures are ambiguous; never arbitrarily pick one.
    if (matches.length !== 1) return { status: matches.length ? 'unavailable' : 'none', match: null }
    return { status: 'matched', match: matches[0] }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return { status: 'unavailable', match: null }
  }
}
