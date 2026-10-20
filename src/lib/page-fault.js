/** x86-64 #PF error-code bits. Missing / malformed error is never silently interpreted as 0. */
const MAX64 = 0xffffffffffffffffn
export function decodePageFault(report) {
  if (!report?.valid || report.vector !== 14) return null
  const raw = String(report.fields?.ERROR ?? '').trim()
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(raw)) {
    return { available: false, summary: 'The processor error code is missing or invalid.', flags: [], warning: 'Access type and page status are unknown.' }
  }
  const number = BigInt(raw)
  if (number < 0n || number > MAX64) return { available: false, summary: 'The error code is out of range.', flags: [], warning: 'The value cannot be interpreted as an x86-64 error code.' }
  const has = bit => (number & (1n << BigInt(bit))) !== 0n
  const operation = has(4) ? 'Instruction fetch' : has(1) ? 'Memory write' : 'Memory read'
  const status = has(0) ? 'Protection violation (page was present)' : 'Page not present'
  const mode = has(2) ? 'User-mode access' : 'Supervisor-mode access'
  const flags = [
    { bit: 0, name: 'Page status', set: has(0), explanation: status },
    { bit: 1, name: 'Write access', set: has(1), explanation: has(1) ? 'This operation wrote to memory.' : 'The access was not a write.' },
    { bit: 2, name: 'Privilege', set: has(2), explanation: mode },
    { bit: 3, name: 'Reserved page-table bit', set: has(3), explanation: has(3) ? 'A reserved bit was set in a paging structure.' : 'Not reported.' },
    { bit: 4, name: 'Instruction fetch', set: has(4), explanation: has(4) ? 'The CPU was trying to execute code.' : 'Not reported.' },
    { bit: 5, name: 'Protection key', set: has(5), explanation: has(5) ? 'A protection-key check was involved.' : 'Not reported.' },
    { bit: 6, name: 'Shadow stack', set: has(6), explanation: has(6) ? 'A shadow-stack access was involved.' : 'Not reported.' },
    { bit: 15, name: 'SGX', set: has(15), explanation: has(15) ? 'An SGX-related restriction was involved.' : 'Not reported.' },
  ]
  const recognised = flags.reduce((acc, field) => acc | (1n << BigInt(field.bit)), 0n)
  const unknown = number & ~recognised & MAX64
  return {
    available: true, raw: `0x${number.toString(16).toUpperCase()}`, summary: `${operation} · ${status} · ${mode}`,
    operation, status, mode, flags, warning: unknown ? 'Additional error-code bits are set. Some are architecture-specific and need manual review.' : '',
    faultAddress: String(report.fields?.CR2 ?? '').trim() || null,
  }
}
