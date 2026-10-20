/** Guided, non-destructive public recommendations. All inputs are fixed-choice. */
export const CONTEXT_CHOICES = Object.freeze({
  stage: ['unknown', 'startup', 'running'],
  activity: ['unknown', 'launching', 'other'],
  recurrence: ['unknown', 'first', 'repeated'],
})
export const DEFAULT_CONTEXT = Object.freeze({ stage: 'unknown', activity: 'unknown', recurrence: 'unknown' })

export function normaliseContext(context = {}) {
  return Object.fromEntries(Object.entries(CONTEXT_CHOICES).map(([key, options]) =>
    [key, options.includes(context[key]) ? context[key] : 'unknown']))
}
export function contextLabels(context) {
  const c = normaliseContext(context)
  return {
    stage: { unknown: 'Not sure', startup: 'During startup', running: 'After startup' }[c.stage],
    activity: { unknown: 'Not sure', launching: 'Opening an application', other: 'Something else' }[c.activity],
    recurrence: { unknown: 'Not sure', first: 'First occurrence', repeated: 'Happened more than once' }[c.recurrence],
  }
}
export function recoveryPlan(result, context) {
  if (!result?.valid) return []
  const c = normaliseContext(context)
  const steps = [
    'Keep the QR code or save a safe diagnostic summary so you can refer back to the error.',
  ]
  if (result.vector === 18) {
    steps.push('Shut down and restart once. A machine-check exception can indicate a hardware or virtual-machine problem.')
    steps.push('If it happens again, stop repeated attempts and ask the computer or VM administrator to review hardware/host logs.')
  } else if (result.vector === 8) {
    steps.push('Restart once. A double fault is a serious kernel failure; do not keep retrying repeatedly if it returns.')
  } else {
    steps.push('Restart Australis once. A single crash may not happen again, but restarting does not fix an underlying defect.')
  }
  if (c.stage === 'startup') {
    steps.push('If startup keeps failing, power down and disconnect recently added non-essential USB devices before trying again.')
  } else if (c.activity === 'launching') {
    steps.push('If the same application triggers the error again, note its name and the steps just before the crash; avoid repeatedly triggering it.')
  }
  if (c.recurrence === 'repeated') {
    steps.push('Since it has happened more than once, check known issues and consider sharing a privacy-safe report with the maintainers.')
  } else if (c.recurrence === 'first') {
    steps.push('If Australis starts normally and the error does not return, keep the report in case it happens again.')
  } else {
    steps.push('If the crash recurs, check existing reports before creating a new GitHub issue.')
  }
  return [...new Set(steps)]
}
