/**
 * Local-only Australis panic diagnosis. No fetch, network, eval, or HTML parsing.
 * Supports the real COM1/framebuffer format as confirmed by panic_boot_smoke.py,
 * JSON reports, and the optional AUP1 QR format documented in README.md.
 */

import { parseAu1 } from './au1.js'

export const SAMPLE_PANIC = `*** AUSTRALIS KERNEL PANIC ***
Fatal CPU exception; interrupts are disabled.
VECTOR  =0x000000000000000E
ERROR   =0x0000000000000000
RIP     =0x00000000001041F2
CS      =0x0000000000000008
RFLAGS  =0x0000000000000202
RSP     =0x00000000003FEEB0
CR2     =0x0000000000000000
RAX     =0x0000000000000000
RBX     =0x0000000000000001
R15     =0x0000000000000000
System halted. Power cycle or reset to continue.`

const PANIC_SIGNATURE = /(?:^|\n)\s*(?:\*{3}\s*AUSTRALIS KERNEL PANIC|(?:KERNEL )?PANIC\s*[:\-]|ASSERT(?:ION)? FAILED\s*[:\-])/i

const VECTORS = {
  0: ['Divide error', 'The CPU attempted integer division by zero or a quotient that could not fit.', ['Inspect the division operands at RIP.', 'Check arithmetic guards and compiler-generated division instructions.']],
  1: ['Debug exception', 'A CPU debugging condition (such as a hardware breakpoint or trap) was triggered.', ['Inspect enabled debug registers and the instruction at RIP.', 'Check whether a debug trap was expected.']],
  2: ['Non-maskable interrupt', 'The CPU received an interrupt that cannot be disabled normally.', ['Inspect hardware and hypervisor diagnostics.', 'Check whether the platform intentionally raised an NMI.']],
  3: ['Breakpoint', 'The CPU encountered a breakpoint instruction.', ['Check for an intentional INT3 or debugger breakpoint.', 'Inspect the instruction at RIP.']],
  4: ['Overflow', 'An overflow trap instruction reported arithmetic overflow.', ['Inspect the instruction and arithmetic values at RIP.']],
  5: ['BOUND range exceeded', 'A legacy bounds check failed.', ['Inspect index calculations and code generation around RIP.']],
  6: ['Invalid opcode', 'The CPU attempted to run machine code that it could not execute.', ['Capture the instruction bytes at the saved RIP from the crashed QEMU instance.', 'Map RIP to the exact matching kernel build and disassemble the surrounding code.', 'Check whether it is a deliberate UD2 trap, an unsupported CPU instruction, invalid compiler output, or a bad branch target.']],
  7: ['Device not available', 'The CPU could not execute a floating-point or SIMD operation in the current processor state.', ['Check FPU/SSE setup and context switching.', 'Inspect CR0/CR4 configuration.']],
  8: ['Double fault', 'A second exception occurred while the CPU was trying to handle an earlier exception.', ['Treat stack corruption or exception-handler failure as high-priority suspects.', 'Inspect the IDT, TSS/IST setup, and exception stack.']],
  10: ['Invalid TSS', 'The CPU found an invalid task-state segment or task switch state.', ['Inspect the GDT/TSS descriptor and error code.']],
  11: ['Segment not present', 'A required protected-mode segment was marked not present.', ['Check GDT entries and segment selectors.']],
  12: ['Stack-segment fault', 'A stack-segment access or state check failed.', ['Check stack limits, selectors, and pointer integrity.']],
  13: ['General protection fault', 'The CPU rejected an operation because it violated an x86-64 protection or addressing rule.', ['Inspect the instruction and pointer values at RIP.', 'Check for non-canonical addresses, invalid segment selectors, or privileged operations.', 'Compare the crash with the deliberate `panic gp` test.']],
  14: ['Page fault', 'The CPU attempted a memory access that the current page tables could not permit.', ['Inspect CR2 (the faulting address) and the page-fault error code.', 'Check page-table mappings, permissions, and object lifetimes.', 'Compare the crash with the deliberate `panic` test, which reads page zero.']],
  16: ['x87 floating-point exception', 'The x87 floating-point unit reported an arithmetic exception.', ['Inspect floating-point state and the instruction at RIP.']],
  17: ['Alignment check', 'A memory access violated an enabled alignment requirement.', ['Inspect the access at RIP and the pointer alignment.']],
  18: ['Machine check', 'The CPU reported a hardware-detected machine-check condition.', ['Inspect machine-check status registers and host hardware logs.', 'Do not assume this is a software bug.']],
  19: ['SIMD floating-point exception', 'An SSE or SIMD floating-point operation raised an exception.', ['Inspect MXCSR and the instruction at RIP.']],
  20: ['Virtualization exception', 'A CPU virtualization-related exception was raised.', ['Inspect the virtualization context and hypervisor setup.']],
  21: ['Control protection exception', 'A control-flow enforcement check failed.', ['Check control-flow enforcement configuration and return addresses.']],
  28: ['Hypervisor injection exception', 'The hypervisor reported an injection-related exception.', ['Inspect virtualization and hypervisor diagnostics.']],
  29: ['VMM communication exception', 'The processor reported a virtualization communication fault.', ['Inspect guest/hypervisor state.']],
  30: ['Security exception', 'A CPU security-related exception occurred.', ['Inspect the architecture-specific error code and machine security state.']],
  255: ['Unexpected interrupt', 'Australis reported an interrupt that was not expected by its exception handler.', ['Inspect interrupt vector registration and IDT routing.', 'Check IRQ acknowledgements and interrupt ownership.']],
}

const KEYS = new Set([
  'VECTOR', 'ERROR', 'RIP', 'RSP', 'CR2', 'CS', 'RFLAGS', 'SS', 'RAX', 'RBX', 'RCX', 'RDX',
  'RSI', 'RDI', 'RBP', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'PID',
  'PROCESS', 'BUILD', 'KBASE', 'VERSION', 'MESSAGE', 'TIME',
])
const ALIASES = {
  V: 'VECTOR', VEC: 'VECTOR', EXCEPTION: 'VECTOR', EXCEPTION_VECTOR: 'VECTOR',
  E: 'ERROR', ERR: 'ERROR', ERROR_CODE: 'ERROR',
  IP: 'RIP', PC: 'RIP', SP: 'RSP', A: 'CR2', FAULT_ADDRESS: 'CR2', ADDRESS: 'CR2',
  M: 'MESSAGE', MSG: 'MESSAGE', REASON: 'MESSAGE',
  KERNEL: 'VERSION', KERNEL_VERSION: 'VERSION', TIMESTAMP: 'TIME',
  B: 'BUILD', BID: 'BUILD', BUILD_ID: 'BUILD', KB: 'KBASE', BASE: 'KBASE', CODE_BASE: 'KBASE',
}

function normalizeKey(key) {
  const upper = String(key).trim().replace(/[\s-]+/g, '_').toUpperCase()
  return ALIASES[upper] || upper
}

function assign(fields, key, value) {
  const normalized = normalizeKey(key)
  if (!KEYS.has(normalized) || value === undefined || value === null) return
  const text = String(value).trim()
  if (text && text.length <= 2048) fields[normalized] = text
}

function parseCompact(raw, fields) {
  if (!/^AUP1[;|:]/i.test(raw)) return false
  const parts = raw.replace(/^AUP1[;|:]/i, '').split(/[;|]/)
  for (const part of parts) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const key = part.slice(0, index)
    const encoded = part.slice(index + 1)
    let value = encoded
    try { value = decodeURIComponent(encoded) } catch { /* Preserve malformed escapes */ }
    assign(fields, key, value)
  }
  return true
}

function parseJson(raw, fields) {
  if (!raw.startsWith('{')) return false
  let object
  try { object = JSON.parse(raw) } catch { return false }
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false
  for (const [key, value] of Object.entries(object)) {
    if (value !== null && typeof value !== 'object') assign(fields, key, value)
  }
  for (const groupName of ['registers', 'regs', 'frame', 'context']) {
    const group = object[groupName]
    if (group && typeof group === 'object' && !Array.isArray(group)) {
      for (const [key, value] of Object.entries(group)) {
        if (value !== null && typeof value !== 'object') assign(fields, key, value)
      }
    }
  }
  return true
}

function parseAustralisText(raw, fields) {
  const re = /^\s*(VECTOR|ERROR|RIP|RSP|CR2|CS|RFLAGS|SS|RAX|RBX|RCX|RDX|RSI|RDI|RBP|R(?:[89]|1[0-5])|PID|PROCESS|BUILD|KBASE|VERSION|MESSAGE|TIME)\s*[:=]\s*([^\r\n]+)\s*$/gim
  let found = false
  for (const match of raw.matchAll(re)) {
    assign(fields, match[1], match[2])
    found = true
  }
  if (!fields.MESSAGE) {
    const reason = raw.match(/^\s*(?:PANIC|KERNEL PANIC|REASON|FATAL|ASSERT(?:ION)? FAILED)\s*[:\-]\s*(.+)$/im)
    if (reason) assign(fields, 'MESSAGE', reason[1])
  }
  return found
}

function numeric(text) {
  if (text === undefined || text === null) return null
  const value = String(text).trim()
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) return null
  try {
    const big = BigInt(value)
    if (big < 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(big)
  } catch { return null }
}

function isZeroHex(text) {
  if (!text || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(text)) return false
  try { return BigInt(text) === 0n } catch { return false }
}

function asHex(value) { return `0x${value.toString(16).toUpperCase()}` }

function pageFaultFindings(fields, add) {
  const error = numeric(fields.ERROR)
  if (error === null) {
    add('Error-code bits', 'Not supplied; memory access type and permission cause are unknown.')
  } else {
    add('Mapping', (error & 1) ? 'The page was present, but access violated protection rules.' : 'The page was not present in the active address space.')
    add('Operation', (error & 16) ? 'Instruction fetch (attempted execution)' : (error & 2) ? 'Memory write' : 'Memory read')
    add('Privilege', (error & 4) ? 'Access originated in user mode' : 'Access originated in supervisor mode')
    if (error & 8) add('Page tables', 'A reserved bit was set in a paging-structure entry.')
    if (error & 32) add('Protection key', 'A protection-key check blocked the access.')
    if (error & 64) add('Shadow stack', 'The access involved a shadow-stack protection check.')
    if (error & 32768) add('SGX', 'The processor flagged an SGX-specific fault.')
  }
  if (fields.CR2) {
    add('Faulting address (CR2)', `${fields.CR2}${isZeroHex(fields.CR2) ? ' — null page / address zero' : ''}`)
  } else {
    add('Faulting address', 'CR2 missing; the memory address that failed is unknown.')
  }
}

function reportText(result) {
  const lines = [
    'AUSTRALIS PANIC DECODER — DIAGNOSTIC REPORT',
    '==========================================',
    `Diagnosis: ${result.title}`,
    `Interpretation: ${result.summary}`,
    `Certainty: ${result.certainty}`,
    '',
    'Possible explanations (not confirmed):',
    ...(result.possibleCauses.length ? result.possibleCauses.map((item) => `- ${item}`) : ['- The report does not narrow this down further.']),
    '',
    `Evidence needed to identify the actual cause: ${result.nextEvidence}`,
    `Input: ${result.source}`,
    '',
    'Evidence:',
    ...(result.findings.length ? result.findings.map((item) => `- ${item.label}: ${item.value}`) : ['- No recognised exception data']),
    '',
    'Suggested checks:',
    ...result.actions.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Original panic payload:',
    result.raw,
    '',
    'Interpretations identify likely causes, not a proven root cause. Verify against kernel source and debug symbols.',
  ]
  return lines.join('\n')
}

export function diagnosePanic(input) {
  const raw = String(input ?? '').replace(/\0/g, '').trim()
  if (!raw) throw new Error('Paste a panic report, scan a QR code, or upload a QR image first.')
  if (raw.length > 65536) throw new Error('The input is too large (maximum 64 KiB). Provide a shorter panic report.')

  const au1 = parseAu1(raw)
  if (au1) {
    const descriptions = {
      test: 'QR test payload detected',
      unmapped: 'AU1 diagnostic QR detected',
      malformed: 'Incomplete AU1 QR payload',
      unsupported: 'Unsupported QR format version',
    }
    const title = descriptions[au1.kind]
    return {
      valid: false,
      format: 'AU1',
      inputStatus: au1.kind,
      source: 'Australis AU1 QR payload',
      fields: {}, vector: null, title,
      summary: au1.reason,
      certainty: 'No CPU exception or root cause identified',
      findings: [], actions: [], possibleCauses: [],
      nextEvidence: 'Keep the original serial panic output. Confirm the AU1 field definitions before interpreting packed values.',
      raw, qr: au1,
      report: `Australis AU1 diagnostic data\n${title}\n${au1.reason}\n`,
    }
  }

  const fields = {}
  let source = 'Unrecognised text'
  if (parseCompact(raw, fields)) source = 'Australis AUP1 QR payload'
  else if (parseJson(raw, fields)) source = 'Structured JSON report'
  else if (parseAustralisText(raw, fields)) source = 'Australis console report'
  else if (PANIC_SIGNATURE.test(raw)) source = 'Unstructured panic message'

  const vector = numeric(fields.VECTOR)
  const known = vector !== null && (VECTORS[vector] || (vector >= 0 && vector <= 31))
  const vectorInfo = VECTORS[vector] || null
  const hasPanic = !!(Object.keys(fields).length || PANIC_SIGNATURE.test(raw))
  const findings = []
  const add = (label, value) => findings.push({ label, value })
  let title, summary, certainty
  let actions
  let possibleCauses = []
  let nextEvidence = 'Match the saved instruction pointer to the exact kernel build and inspect the surrounding code.'

  if (known) {
    title = vectorInfo ? vectorInfo[0] : `CPU exception ${vector}`
    summary = vectorInfo ? vectorInfo[1] : 'The processor raised an exception. The available vector identifies the event, but more crash context is needed to explain its cause.'
    if (vector === 6) {
      const location = fields.RIP ? ` at ${fields.RIP}` : ''
      const privilege = numeric(fields.CS) !== null && (numeric(fields.CS) & 3) === 0
        ? 'while executing privileged kernel code'
        : 'while executing code'
      summary = `Australis OS encountered invalid machine-code instruction bytes${location} ${privilege}. The processor raised x86-64 exception #UD (vector 6), and Australis stopped the kernel rather than continuing in an unsafe state. This is an instruction execution failure, not evidence of a page fault. The panic identifies WHERE execution failed, but not yet WHY those bytes were executed.`
      possibleCauses = [
        'Hydrogen or another code-generation stage emitted an instruction that this CPU cannot execute.',
        'A jump or return landed inside data or in the middle of an instruction, perhaps because an address was wrong.',
        'The kernel executed an intentional invalid-instruction trap (UD2), or machine code was overwritten or corrupted.',
      ]
      nextEvidence = fields.RIP
        ? `Capture the bytes and disassembly at RIP ${fields.RIP} in the SAME crashed kernel build. In QEMU with GDB attached: x/16xb ${fields.RIP} then x/8i ${fields.RIP}. Map that runtime address to a kernel symbol or code offset. If the bytes are 0F 0B, investigate an intentional UD2 trap; if they decode as another instruction, check CPU feature support; if they look like data, investigate branch targets and code integrity.`
        : 'Capture the saved RIP and the instruction bytes at that address, then match them to the correct kernel binary.'
    }
    if (vector === 14) {
      const bits = numeric(fields.ERROR)
      const operation = bits === null ? 'access memory' : (bits & 16) ? 'execute code from memory' : (bits & 2) ? 'write to memory' : 'read from memory'
      const address = fields.CR2 ? ` at ${fields.CR2}` : ''
      const issue = bits === null ? 'The error code is missing, so the precise access violation is unknown.' : (bits & 1) ? 'The page existed but its permissions denied that access.' : 'The needed page was not mapped.'
      summary = `Australis tried to ${operation}${address}. ${issue} The CPU raised a page fault and the kernel halted to avoid continuing after a fatal supervisor exception.`
      if (fields.CR2 && isZeroHex(fields.CR2)) {
        summary += ' Address zero suggests a null pointer or the deliberate debug panic test; the report alone cannot distinguish them.'
      }
      possibleCauses = (fields.CR2 && isZeroHex(fields.CR2))
        ? ['A kernel pointer was null and code tried to dereference it.', 'The intentional debug panic test accessed address zero.', 'A pointer or address calculation produced zero.']
        : ['The page was not mapped, or its permissions blocked the attempted access.', 'A pointer, allocation lifetime, or page-table setup error led to an invalid access.']
      nextEvidence = `Inspect the memory access at RIP ${fields.RIP || '(not provided)'}, cross-reference CR2 and the page-fault error bits, and map that code to the matching kernel build.`
    }
    certainty = 'Exception type identified; root cause not proven'
    actions = vectorInfo ? [...vectorInfo[2]] : ['Disassemble the faulting instruction at RIP.', 'Inspect the CPU error code and saved register state.']
    add('Exception vector', `${vector} (${asHex(vector)})`)
    if (vector === 14) pageFaultFindings(fields, add)
    else if (vector === 6) add('Error code', 'Invalid-opcode (#UD) has no CPU-pushed error code. The zero shown by Australis is not a cause indicator.')
    else if (fields.ERROR) add('Reported error code', fields.ERROR)
    if (vector !== 14 && fields.CR2) add('About CR2', `CR2 is only meaningful for page faults. Its reported value (${fields.CR2}) does not identify the cause of exception vector ${vector}; it may be left over from an earlier page fault.`)
    if (fields.CS && numeric(fields.CS) !== null) add('Execution privilege', (numeric(fields.CS) & 3) === 0 ? 'Ring 0 (kernel/supervisor)' : `Ring ${numeric(fields.CS) & 3} (user or less-privileged context)`)
    if (fields.RIP) add('Instruction pointer (RIP)', fields.RIP)
    if (fields.RSP) add('Stack pointer (RSP)', fields.RSP)
    if (vector === 13) {
      possibleCauses = ['A noncanonical address, bad segment-selector use, or another x86-64 protection rule was violated.', 'An instruction or control-transfer target was invalid.']
      nextEvidence = `Disassemble the instruction at RIP ${fields.RIP || '(not provided)'} and inspect its operands, selector fields and relevant CPU state. CR2 does not locate #GP failures.`
    }
    if (vector === 14 && fields.CR2 && isZeroHex(fields.CR2)) {
      actions.unshift('Check for a null pointer or deliberately unmapped page-zero access.')
    }
  } else if (hasPanic) {
    title = vector === null ? 'Kernel panic reported' : `Unknown exception vector ${vector}`
    summary = fields.MESSAGE
      ? `The kernel reported: “${fields.MESSAGE}”. The supplied information is not enough to identify a specific CPU failure.`
      : 'The report indicates a fatal problem, but it does not contain a recognised CPU exception vector. More context is needed.'
    certainty = 'Incomplete report; cause uncertain'
    actions = ['Capture VECTOR, ERROR, RIP and (for page faults) CR2 from COM1 or the crash screen.', 'Compare the instruction at RIP with the matching kernel build and debug symbols.']
    if (fields.VECTOR) add('Supplied vector', fields.VECTOR)
    if (fields.RIP) add('Instruction pointer', fields.RIP)
    if (fields.CR2) add('CR2', fields.CR2)
  } else {
    title = 'No kernel panic recognised'
    summary = 'The input was read, but it does not contain a supported panic signature or diagnostic fields. No cause can be established.'
    certainty = 'Unrecognised input'
    actions = ['Confirm that the QR code contains a crash report rather than a link or unrelated text.', 'Use the Australis serial panic output or the documented AUP1 payload format.']
  }

  if (/^\s*R6\s*[:=]/im.test(raw)) add('Register report anomaly', 'The report contains R6, which is not an x86-64 register name. This may be a typo for R8 in the panic formatter; it is not itself evidence of the crash cause.')
  if (fields.MESSAGE && known) add('Kernel message', fields.MESSAGE)
  for (const key of ['PID', 'PROCESS', 'BUILD', 'VERSION', 'TIME']) {
    if (fields[key]) add(key === 'TIME' ? 'Timestamp' : key, fields[key])
  }
  if (known && !fields.RIP) actions.push('Include RIP in the next panic payload to identify the exact instruction.')
  if (!known && vector !== null && vector >= 0 && vector <= 31) add('Exception vector', `${vector} (${asHex(vector)})`)

  const result = {
    valid: !!hasPanic,
    source,
    fields,
    vector,
    title,
    summary,
    certainty,
    findings,
    actions,
    possibleCauses,
    nextEvidence,
    raw,
  }
  result.report = reportText(result)
  return result
}
