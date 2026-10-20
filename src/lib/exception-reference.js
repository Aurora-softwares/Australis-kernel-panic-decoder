/** User-facing x86-64 exception reference, including architecturally reserved slots. */
const definitions = {
  0: ['Divide error', 'A whole-number division could not complete. The divisor may be zero or the result may not fit.', 'Check the failing calculation and its input values.'],
  1: ['Debug exception', 'The processor detected a debugging event, such as a single-step trap or hardware breakpoint.', 'Check whether a debugger or diagnostic tool deliberately requested this event.'],
  2: ['Non-maskable interrupt', 'The computer signalled an urgent event that normally cannot be ignored.', 'Check the physical machine, virtual machine or hypervisor logs.'],
  3: ['Breakpoint', 'The processor reached a breakpoint, often deliberately inserted for debugging.', 'Check whether a debugger or development build expected this breakpoint.'],
  4: ['Overflow', 'A legacy overflow-trap instruction signalled an arithmetic overflow.', 'Inspect the arithmetic operation being executed.'],
  5: ['BOUND range exceeded', 'An old-style bounds-check instruction detected an out-of-range value.', 'Check array indexes and code emitted around the fault.'],
  6: ['Invalid opcode', 'The CPU could not execute the instruction at the reported location.', 'Investigate unsupported instructions, deliberate UD2 traps, compiler output or bad jump targets.'],
  7: ['Device not available', 'A floating-point or SIMD operation was attempted when that processor feature was not ready.', 'Check floating-point initialization and saved CPU state.'],
  8: ['Double fault', 'Another exception occurred while the CPU was trying to handle a previous one.', 'Check the exception stack and interrupt handlers. A restart may not be enough.'],
  10: ['Invalid TSS', 'The processor rejected task-state information.', 'Check the task-state segment and its descriptor.'],
  11: ['Segment not present', 'A required segment was unavailable.', 'Check segment descriptors and selectors.'],
  12: ['Stack-segment fault', 'The processor detected a problem with stack-segment state.', 'Check stack access and segment state.'],
  13: ['General protection fault', 'An instruction broke a processor protection or addressing rule.', 'Inspect pointers, segment selectors, privileged instructions and the faulting instruction.'],
  14: ['Page fault', 'A memory read, write or instruction fetch could not be completed under the current page tables.', 'Use the page-fault decoder to interpret the CPU error flags and CR2.'],
  16: ['x87 floating-point exception', 'A legacy floating-point calculation raised an exception.', 'Check x87 control and status words.'],
  17: ['Alignment check', 'A memory operation violated an enabled alignment requirement.', 'Check alignment and processor control flags.'],
  18: ['Machine check', 'The processor detected a hardware-related fault.', 'Check host hardware diagnostics or VM host logs.'],
  19: ['SIMD floating-point exception', 'An SSE or SIMD floating-point operation raised an exception.', 'Check SIMD instructions and MXCSR state.'],
  20: ['Virtualization exception', 'The CPU detected an event relating to virtualization.', 'Review virtualization configuration and the hypervisor.'],
  21: ['Control protection exception', 'A control-flow safety mechanism detected a violation.', 'Check control-flow enforcement and saved return addresses.'],
  28: ['Hypervisor injection exception', 'The processor reported an event associated with hypervisor injection.', 'Review the VM host and virtualization configuration.'],
  29: ['VMM communication exception', 'An event occurred while communicating with a virtual-machine monitor.', 'Review the VM monitor and guest state.'],
  30: ['Security exception', 'The processor reported an architecture-specific security condition.', 'Inspect processor security state and the recorded error code.'],
  255: ['Unexpected interrupt (Australis)', 'Australis uses 255 as a sentinel for an unexpected interrupt. It is not an architectural CPU exception vector.', 'Review interrupt routing and device registration.'],
}
const reserved = new Set([9, 15, 22, 23, 24, 25, 26, 27, 31])

export const exceptionReference = Object.freeze([...Array(32).keys(), 255].map(vector => {
  const entry = definitions[vector]
  return Object.freeze({
    vector, hex: `0x${vector.toString(16).toUpperCase().padStart(2, '0')}`,
    name: entry?.[0] ?? (reserved.has(vector) ? 'Reserved CPU vector' : 'Reserved or platform-specific vector'),
    explanation: entry?.[1] ?? 'This vector is not assigned a standard exception meaning in the current x86-64 reference. It must not be interpreted as a specific bug.',
    next: entry?.[2] ?? 'Retain the full diagnostic information and check the CPU and platform documentation.',
    reserved: !entry,
  })
}))

export const exceptionByVector = vector => exceptionReference.find(item => item.vector === Number(vector)) || null
