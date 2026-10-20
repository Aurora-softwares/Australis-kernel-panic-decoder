/** AU1 has no boot-stage field. Never infer a stage from RIP or the vector. */
const STAGES = Object.freeze({
  boot: ['Early boot', 'The system was starting before normal services were ready.'],
  initialization: ['Kernel initialization', 'Australis was bringing up its core kernel services.'],
  drivers: ['Device initialization', 'The system was preparing or using device drivers.'],
  filesystem: ['Filesystem startup', 'The system was discovering, mounting or preparing storage volumes.'],
  userland: ['Starting user applications', 'The system was starting its initial user-facing processes.'],
  running: ['System running', 'Australis had reached normal operation.'],
})
const ALIASES = { early: 'boot', init: 'initialization', storage: 'filesystem', applications: 'userland', application: 'userland', runtime: 'running' }
export function identifyBootStage(report, context = {}) {
  const raw = report?.valid ? String(report.fields?.STAGE ?? '').trim().toLowerCase() : ''
  const stage = STAGES[raw] ? raw : ALIASES[raw]
  if (stage && STAGES[stage]) return { confidence: 'reported', title: STAGES[stage][0], description: STAGES[stage][1] }
  if (context?.stage === 'startup') return { confidence: 'user', title: 'During startup (your answer)', description: 'You reported that the crash happened during startup. The QR itself did not identify a precise boot stage.' }
  if (context?.stage === 'running') return { confidence: 'user', title: 'After startup (your answer)', description: 'You reported that Australis had started. The QR itself did not provide a precise stage.' }
  return { confidence: 'unknown', title: 'Boot stage not available', description: 'The current AU1 QR format does not include a boot-stage indicator. You can answer the recovery questions to add context.' }
}
export const supportedBootStages = Object.keys(STAGES)
