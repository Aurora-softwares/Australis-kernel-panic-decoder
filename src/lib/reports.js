import { publicDiagnosis } from './public-diagnosis.js'
import { publicIssueLabel } from './issues.js'
import { assessReport } from './validation.js'
import { recoveryPlan, contextLabels } from './recovery.js'

export function safeDiagnosticText(result, context, known = null) {
  if (!result?.valid) return 'No supported Australis panic has been identified.\n'
  const explanation = publicDiagnosis(result)
  const assess = assessReport(result)
  const labels = contextLabels(context)
  const steps = recoveryPlan(result, context)
  return [
    'AUSTRALIS OS — SAFE CRASH SUMMARY',
    '================================',
    `Issue: ${publicIssueLabel(result) || 'Kernel panic'}`,
    `Exception vector: ${Number.isInteger(result.vector) && result.vector >= 0 && result.vector <= 255 ? result.vector : 'unavailable'}`,
    `Report quality: ${assess.level}`,
    '',
    'What happened',
    explanation.description,
    '',
    'What we know',
    Number.isInteger(result.vector) && ((result.vector >= 0 && result.vector <= 31) || result.vector === 255)
      ? 'The supplied report identifies a CPU exception. Its exact underlying software or hardware cause has not been proved by this alone.'
      : 'The supplied report does not establish a valid CPU exception. No exact cause can be concluded.',
    known?.status === 'matched'
      ? `A curated issue record was matched: ${known.match.status} — ${known.match.url}. This does not prove every occurrence has the same root cause.`
      : 'No confirmed known-issue match was established.',
    '',
    'Answers provided',
    `Stage: ${labels.stage}`,
    `Activity: ${labels.activity}`,
    `Frequency: ${labels.recurrence}`,
    '',
    'Suggested next steps',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'PRIVACY: No raw addresses, register values, private logs, source code, or QR contents are included.',
  ].join('\n') + '\n'
}

export function technicalDiagnosticText(result, context, known) {
  if (!result?.valid) return safeDiagnosticText(result, context, known)
  return `${safeDiagnosticText(result, context, known)}\n----- PRIVATE TECHNICAL INFORMATION -----\n${result.report}\n`
}
