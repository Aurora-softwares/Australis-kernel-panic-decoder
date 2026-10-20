/** Public-facing payload validation, distinct from the low-level parser. */
const supportedVector = (value) => Number.isInteger(value) && ((value >= 0 && value <= 31) || value === 255)
const hexNumber = (value) => typeof value === 'string' && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value.trim())

export function assessReport(report) {
  if (report?.format === 'AU1') return {
    level: report.inputStatus === 'test' ? 'test' : 'unsupported',
    title: report.title,
    explanation: report.summary,
    next: report.inputStatus === 'test'
      ? 'The QR generator is working, but this sample contains no actual exception data.'
      : 'Use the full serial panic report for now, or confirm the on-wire AU1 field mapping.',
  }
  if (!report?.valid) return {
    level: 'invalid', title: 'This is not a recognised Australis crash report',
    explanation: 'The QR code may contain unrelated text, a URL, or an unsupported format.',
    next: 'Scan the full QR code again, upload a clearer screenshot, or paste the complete panic message.',
  }
  const fields = report.fields || {}
  if (!supportedVector(report.vector)) {
    if (fields.VECTOR) return {
      level: 'unsupported', title: 'The exception number could not be interpreted',
      explanation: 'The code may be damaged, or the report may come from a format this decoder does not support yet.',
      next: 'Check that the full QR code was captured. Try pasting the serial output instead.',
    }
    return {
      level: 'partial', title: 'Only part of the crash report was available',
      explanation: 'Australis reported a panic, but the CPU exception number is missing.',
      next: 'You can still save this result. If possible, capture the full serial report or scan again.',
    }
  }
  const invalidAddresses = ['RIP', 'RSP', 'CR2', 'KBASE'].filter(k => fields[k] && !hexNumber(fields[k]))
  if (invalidAddresses.length) return {
    level: 'partial', title: 'Some diagnostic details could not be read',
    explanation: 'One or more numeric address fields are malformed, so source-code lookup might not work.',
    next: 'Scan again or paste the full panic report. Do not rely on a source-code match until the values are valid.',
  }
  if (!fields.RIP) return {
    level: 'partial', title: 'The crash report is missing an instruction address',
    explanation: 'The error category can be explained, but the program location cannot be identified.',
    next: 'If the kernel displays a longer panic report, include the RIP field for better diagnosis.',
  }
  return { level: 'complete', title: '', explanation: '', next: '' }
}
