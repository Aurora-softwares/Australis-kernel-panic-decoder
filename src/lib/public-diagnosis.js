/** Public-friendly summaries: never echo machine addresses, local paths or raw messages. */
const EXPLANATIONS = {
  0: 'The operating system encountered a problem while performing a calculation.',
  1: 'The processor raised a debugging-related exception while the operating system was running.',
  2: 'The processor received an urgent interrupt that stopped normal operation.',
  3: 'The operating system encountered a software breakpoint.',
  4: 'An arithmetic operation triggered an overflow exception.',
  5: 'The processor detected an out-of-range operation.',
  6: 'The processor could not execute an instruction while the operating system was running.',
  7: 'A processor feature needed by an instruction was not ready for use.',
  8: 'A second processor fault happened while the first one was being handled.',
  10: 'The processor detected a problem with its task-management state.',
  11: 'The processor could not access a required segment.',
  12: 'The processor detected a problem involving stack access.',
  13: 'The processor rejected an operation because it broke a memory or protection rule.',
  14: 'The operating system tried to access memory that was not available or permitted.',
  16: 'The processor detected a floating-point calculation exception.',
  17: 'A memory operation did not meet the processor’s alignment requirements.',
  18: 'The processor reported a serious hardware-related condition.',
  19: 'The processor detected a problem during a floating-point or SIMD operation.',
  20: 'The processor reported a virtualisation-related exception.',
  21: 'A processor control-flow safety check failed.',
  28: 'The virtualised environment reported a processor exception.',
  29: 'The processor reported a virtual-machine communication exception.',
  30: 'The processor raised a security-related exception.',
  255: 'An unexpected interrupt reached the operating system.',
}

export function publicDiagnosis(result) {
  if (result?.format === 'AU1' && !result.valid) {
    const isTest = result.inputStatus === 'test'
    return {
      title: result.title,
      description: result.summary,
      guidance: isTest
        ? 'When Australis displays a real panic, scan that QR code or paste the complete serial panic report. Do not open a GitHub issue for this test code.'
        : result.inputStatus === 'unmapped'
          ? 'Try scanning again, upload a clearer image, or paste the complete serial panic report.'
          : 'Try scanning again, upload a clearer image, or paste the complete serial panic message.',
    }
  }
  if (!result?.valid) return { title: 'No crash detected', description: 'This does not look like an Australis OS panic report. Try scanning the QR code again or pasting the full error.', guidance: 'Make sure the complete QR code or panic message is visible.' }
  let description = EXPLANATIONS[result.vector] || 'Australis OS encountered an unexpected condition and stopped to prevent further problems.'
  if (result.vector === 14) {
    // Translate CPU page-fault error bits without ever displaying raw addresses.
    try {
      const flags = BigInt(result.fields?.ERROR ?? '')
      const access = (flags & 16n) ? 'execute code from' : (flags & 2n) ? 'write to' : 'read from'
      const mapping = (flags & 1n) ? 'memory that was protected against that operation' : 'memory that was not mapped'
      description = `The operating system tried to ${access} ${mapping}.`
    } catch { /* Keep the generic explanation when the error code is unavailable. */ }
  }
  const extra = result.vector === 18
    ? ' This could relate to the computer or virtual machine, not necessarily a software defect.'
    : ''
  return {
    title: result.title === 'Kernel panic reported' ? 'System error' : result.title,
    description: `${description}${extra} Australis stopped safely rather than continuing in an uncertain state.`,
    guidance: 'Restart Australis OS. If the error happens again, check for an existing report below before opening a new one.',
  }
}
