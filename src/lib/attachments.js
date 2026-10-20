/** Conservative local preview only. This is not a security-grade anonymizer. */
export function redactLog(input) {
  const text = String(input ?? '').slice(0, 128_000)
  return text
    .replace(/(?:bearer\s+|(?:access[_-]?token|api[_-]?key|password|secret)\s*[:=]\s*)[^\s,;"']+/gi, '[REDACTED SECRET]')
    .replace(/\b(?:[\w.+-]+@[\w.-]+\.[a-z]{2,})\b/gi, '[REDACTED EMAIL]')
    .replace(/\b(?:https?:\/\/)[^\s<>'"`]+/gi, '[REDACTED URL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED IP]')
    .replace(/\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{0,4}\b/gi, '[REDACTED IP/ADDRESS]')
    .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, '[REDACTED MAC]')
    .replace(/\b0x[0-9a-f]+\b/gi, '[REDACTED HEX]')
    .replace(/\b[0-9a-f]{16,}\b/gi, '[REDACTED HEX]')
    .replace(/(?:\/home\/|\/Users\/|C:\\Users\\)[^\s"'<>]+/gi, '[REDACTED PATH]')
    .replace(/\b(?:RIP|RSP|RBP|RAX|RBX|RCX|RDX|R[89]|R1[0-5]|CR2)\s*[:=]\s*\S+/gi, '[REDACTED REGISTER]')
}

export function attachmentInstructions() {
  return [
    'GitHub does not allow this website to attach files to a pre-filled issue link.',
    'For a screenshot: crop to the relevant error, check for names, filenames, addresses and other sensitive text, then attach it manually on GitHub.',
    'For a serial log: preview the redacted text here, review every line yourself and copy only what you want to share.',
    'Redaction is best-effort and may miss sensitive information. Neither the screenshot nor log is uploaded by this website.',
  ]
}
