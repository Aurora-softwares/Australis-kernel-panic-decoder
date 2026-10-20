/**
 * Australis kernel panic QR transport, version AU1 (confirmed by the kernel).
 *
 * AU1:VV:EEEEEEEEEEEEEEEE:IIIIIIIIIIIIIIII:SSSSSSSSSSSSSSSS:AAAAAAAAAAAAAAAA
 *
 * VV = x86 exception vector (two hexadecimal digits, NOT decimal)
 * E  = 64-bit CPU error code
 * I  = 64-bit instruction pointer (RIP)
 * S  = 64-bit stack pointer (RSP)
 * A  = 64-bit fault address (CR2; relevant only to page faults, vector 0x0E)
 *
 * A QR payload does not include an OS version or kernel build fingerprint.
 * Source lookup and precise known-issue matching therefore remain unavailable
 * until such metadata is supplied separately. Never infer a source location.
 */

export const AU1_EXAMPLE = 'AU1:00:0000000000000000:0000000000000000:0000000000000000:0000000000000000'
// Synthetic example only. No real user's kernel addresses are bundled.
export const AU1_PAGE_FAULT_EXAMPLE = 'AU1:0E:0000000000000000:0000000000012345:0000000000023456:0000000000000000'

/** Recognise a scanned QR string or the QR payload inside a smoke-test log. */
export function extractAu1(input) {
  const raw = String(input ?? '').replace(/\0/g, '').trim()
  // Only the "QR payload:" line of a smoke-test transcript is the on-wire QR.
  const transcript = raw.match(/^\s*QR\s+payload:\s*(\S+)\s*$/im)
  if (transcript) return transcript[1]
  // Accept spaces around colon delimiters in manually pasted examples.
  if (/^AU\d+\s*(?::|$)/i.test(raw)) return raw
  return null
}

/**
 * Return kind 'crash' only for a structurally complete, supported AU1 record.
 * Every word is preserved exactly as unsigned 64-bit hexadecimal text.
 */
export function parseAu1(input) {
  const extracted = extractAu1(input)
  if (extracted === null) return null
  const payload = extracted.replace(/\s*:\s*/g, ':').trim().toUpperCase()
  const head = /^AU(\d+)/.exec(payload)
  if (!head || head[1] !== '1') {
    return { kind: 'unsupported', payload, reason: 'This diagnostic QR uses a format version that this website does not recognise.' }
  }
  const match = /^AU1:([0-9A-F]{2}):([0-9A-F]{16}):([0-9A-F]{16}):([0-9A-F]{16}):([0-9A-F]{16})$/.exec(payload)
  if (!match) {
    return { kind: 'malformed', payload, reason: 'The AU1 QR data is incomplete or contains unexpected characters.' }
  }
  const [, header, error, rip, rsp, cr2] = match
  const vector = parseInt(header, 16)
  const words = [error, rip, rsp, cr2]
  // The smoke-test fixture intentionally encodes no CPU state. Vector zero is
  // a real divide error if it comes with nonzero state; don't discard that.
  if (vector === 0 && words.every(word => word === '0000000000000000')) {
    return {
      kind: 'test', payload, header, vector, words,
      reason: 'This is a zero-filled QR generator test. It proves a QR payload was produced, but contains no useful crash information.',
    }
  }
  // The kernel's panic exception ABI covers CPU exceptions 0..31; 255 is the
  // documented unexpected-interrupt sentinel. Other values are not CPU faults.
  if (vector > 31 && vector !== 255) {
    return {
      kind: 'unsupported-vector', payload, header, vector, words,
      reason: 'The QR code is intact, but its exception number is not one this decoder can safely classify.',
    }
  }
  return {
    kind: 'crash', payload, header, vector, words,
    fields: {
      VECTOR: `0x${header}`,
      ERROR: `0x${error}`,
      RIP: `0x${rip}`,
      RSP: `0x${rsp}`,
      CR2: `0x${cr2}`,
    },
  }
}
