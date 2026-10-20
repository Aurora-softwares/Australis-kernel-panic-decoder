/** Stable, local comparison fingerprint. NOT a proof of identical root causes. */
const MAX64 = 0xffffffffffffffffn
function hex64(text) {
  if (typeof text !== 'string' || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(text.trim())) return null
  try { const n = BigInt(text.trim()); return n >= 0n && n <= MAX64 ? n : null } catch { return null }
}
function fnv64(input) {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte)
    hash = (hash * 0x100000001b3n) & MAX64
  }
  return hash.toString(16).toUpperCase().padStart(16, '0')
}
export function localCrashSignature(report) {
  if (!report?.valid || !Number.isInteger(report.vector) || report.vector < 0 || report.vector > 255) return null
  const rip = hex64(report.fields?.RIP)
  const error = hex64(report.fields?.ERROR)
  const build = typeof report.fields?.BUILD === 'string' && /^[a-z0-9._-]{6,64}$/i.test(report.fields.BUILD) ? report.fields.BUILD.toLowerCase() : null
  const base = hex64(report.fields?.KBASE)
  const codeOffset = rip !== null && base !== null && rip >= base ? rip - base : null
  const location = codeOffset !== null ? `offset:${codeOffset.toString(16)}` : rip !== null ? `rip:${rip.toString(16)}` : 'unknown'
  const pfBits = report.vector === 14 && error !== null ? (error & 0x7fn).toString(16) : 'na'
  // A location-aware signature without a build can shift across recompiles / ASLR.
  const precision = build && codeOffset !== null ? 'build-aware' : rip !== null ? 'address-based' : 'category-only'
  const canonical = `australis-local-v1|v${report.vector}|${build ?? 'unknown-build'}|${location}|pf${pfBits}`
  return {
    code: `AU-${fnv64(canonical)}`, precision,
    explanation: precision === 'build-aware'
      ? 'Uses the supplied build identity and executable offset. Matching it identifies a repeated crash site, not a proved common cause.'
      : precision === 'address-based'
        ? 'Includes the crash instruction address. Compare only with reports from the same kernel build and load layout.'
        : 'Only the error category is available. Many unrelated crashes can share this identifier.',
  }
}
