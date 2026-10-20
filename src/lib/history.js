/** Opt-in only. Never store raw panic text, registers, images, or IP addresses. */
import { localCrashSignature } from './crash-signature.js'
const KEY = 'australis-safe-history-v1'
const CONSENT = 'australis-history-consent-v1'
const MAX = 25
const VALID_CODE = /^AU-[0-9A-F]{16}$/
const allowed = new Set(['build-aware', 'address-based', 'category-only'])

function safe(entry) {
  if (!entry || typeof entry !== 'object' || !VALID_CODE.test(entry.code) ||
      !Number.isInteger(entry.vector) || entry.vector < 0 || entry.vector > 255 ||
      !allowed.has(entry.precision) || !Number.isSafeInteger(entry.at) || entry.at < 0 ||
      typeof entry.name !== 'string' || !/^[A-Za-z0-9 ()#\-]{2,70}$/.test(entry.name)) return null
  return { code: entry.code, vector: entry.vector, precision: entry.precision, at: entry.at, name: entry.name }
}
export function historyEnabled(storage) {
  try { return storage?.getItem(CONSENT) === 'yes' } catch { return false }
}
export function setHistoryEnabled(storage, enabled) {
  try {
    if (enabled) storage.setItem(CONSENT, 'yes')
    else { storage.removeItem(CONSENT); storage.removeItem(KEY) }
    return true
  } catch { return false }
}
export function loadHistory(storage) {
  if (!historyEnabled(storage)) return []
  try {
    const records = JSON.parse(storage.getItem(KEY) || '[]')
    return Array.isArray(records) ? records.slice(0, MAX).map(safe).filter(Boolean) : []
  } catch { return [] }
}
export function recordHistory(storage, report, timestamp = Date.now()) {
  if (!historyEnabled(storage) || !report?.valid) return loadHistory(storage)
  const signature = localCrashSignature(report)
  if (!signature) return loadHistory(storage)
  const record = safe({ code: signature.code, vector: report.vector, precision: signature.precision, at: timestamp,
    name: /^([A-Za-z0-9 ()#-]{2,70})$/.test(report.title ?? '') ? report.title : `CPU exception ${report.vector}` })
  if (!record) return loadHistory(storage)
  try {
    const next = [record, ...loadHistory(storage)].slice(0, MAX)
    storage.setItem(KEY, JSON.stringify(next))
    return next
  } catch { return loadHistory(storage) }
}
export function clearHistory(storage) {
  try { storage?.removeItem(KEY) } catch { /* unavailable */ }
}
export function signatureOccurrences(history, signature) {
  return signature ? history.filter(entry => entry.code === signature.code).length : 0
}
