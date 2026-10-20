/**
 * AU1 is the compact QR transport currently emitted by the Australis panic QR
 * smoke test. The on-wire *shape* is established; the meaning/order of its
 * five numeric fields has NOT been supplied. Never invent register mappings.
 *
 * AU1:HH:WWWWWWWWWWWWWWWW:WWWWWWWWWWWWWWWW:WWWWWWWWWWWWWWWW:WWWWWWWWWWWWWWWW
 *
 * HH = one byte of as-yet-undocumented metadata; each W = 64-bit hex word.
 * The all-zero test fixture is not a meaningful panic record.
 */

export const AU1_EXAMPLE = 'AU1:00:0000000000000000:0000000000000000:0000000000000000:0000000000000000'

/** Recognise either a scanned AU1 string or a pasted smoke-test transcript. */
export function extractAu1(input) {
  const raw = String(input ?? '').replace(/\0/g, '').trim()
  // The transcript is NOT itself QR data; only the "QR payload:" line is.
  const transcript = raw.match(/^\s*QR\s+payload:\s*(\S+)\s*$/im)
  if (transcript) return transcript[1]
  if (/^AU\d+(?::|$)/i.test(raw)) return raw
  return null
}

export function parseAu1(input) {
  const extracted = extractAu1(input)
  if (extracted === null) return null
  const head = /^AU(\d+)/i.exec(extracted)
  if (!head || head[1] !== '1') {
    return { kind: 'unsupported', payload: extracted, reason: 'This diagnostic QR uses a format version that this website does not recognise.' }
  }
  // Strictly require all 4 words: don't silently accept a damaged QR string.
  const match = /^AU1:([0-9A-Fa-f]{2})(?::([0-9A-Fa-f]{16})){4}$/.exec(extracted)
  if (!match) {
    return { kind: 'malformed', payload: extracted, reason: 'The AU1 QR data is incomplete or contains unexpected characters.' }
  }
  // A repeated capture is used instead of match groups to preserve all words.
  const [, header, ...words] = extracted.split(':')
  const clean = words.map(value => value.toUpperCase())
  const test = header.toUpperCase() === '00' && clean.every(word => /^0{16}$/.test(word))
  return {
    kind: test ? 'test' : 'unmapped',
    payload: extracted.toUpperCase(),
    header: header.toUpperCase(),
    words: clean,
    reason: test
      ? 'This is a zero-filled QR generator test. It proves a QR payload was produced, but contains no useful crash information.'
      : 'The AU1 payload is readable, but the field order has not yet been confirmed. We cannot safely name the CPU exception or source-code location.',
  }
}
