import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnosePanic } from '../src/lib/diagnose.js'
import { assessReport } from '../src/lib/validation.js'
import { lookupKnownIssue, crashSignature } from '../src/lib/known-issues.js'
import { recoveryPlan, normaliseContext } from '../src/lib/recovery.js'
import { safeDiagnosticText, technicalDiagnosticText } from '../src/lib/reports.js'
import { newIssueUrl } from '../src/lib/issues.js'

const raw = '*** AUSTRALIS KERNEL PANIC ***\nVECTOR=0x6\nRIP=0x40001234\nRSP=0x4000BEEF\nBUILD=abc123456\nKBASE=0x40000000\nMESSAGE=private machine name spooky-host'
const report = diagnosePanic(raw)
const categoryOnly = diagnosePanic('AUP1;v=6;ip=0x40001234')
const context = { stage: 'startup', activity: 'launching', recurrence: 'repeated' }
const signature = 'sig1:abc123456:v6:o1234:e0'
const db = (issues) => ({ schema: 1, repository: 'Aurora-softwares/Australis-OS', issues })
const entry = (overrides={}) => ({signature, issue: 42, status: 'investigating', title: 'Invalid jump target during startup', summary: 'Reported on a specific development build.', recovery: 'Restart once and avoid repeating the trigger.', ...overrides})

const fakeFetch = (json) => async (url, opts) => {
  assert.equal(url, '/Australis/known-issues/index.json')
  assert.equal(opts.credentials, 'omit')
  assert.doesNotMatch(url, /40001234|spooky-host/i)
  return { ok: true, json: async () => json }
}

test('only build, code base, exact offset, and exception produce curated signature', () => {
  assert.equal(crashSignature(report), signature)
  assert.equal(crashSignature(categoryOnly), null)
  assert.equal(crashSignature(diagnosePanic('AUP1;v=6;ip=0x100;b=abc123456')), null)
  assert.equal(crashSignature(diagnosePanic('AUP1;v=14;ip=0x200;kb=0x100;b=abc123456')), null)
})
test('verified curated match includes dedicated status and trusted issue link', async () => {
  const response = await lookupKnownIssue(report, fakeFetch(db([entry()])), '/Australis/')
  assert.equal(response.status, 'matched')
  assert.equal(response.match.status, 'investigating')
  assert.equal(response.match.url, 'https://github.com/Aurora-softwares/Australis-OS/issues/42')
})
test('same vector is never sufficient for a known-issue match', async () => {
  const response = await lookupKnownIssue(categoryOnly, () => { throw Error('no request expected') }, '/Australis/')
  assert.equal(response.status, 'not-enough-data')
  const differentBuild = diagnosePanic('AUP1;v=6;ip=0x40001234;kb=0x40000000;b=differentbuild')
  assert.equal((await lookupKnownIssue(differentBuild, fakeFetch(db([entry()])), '/Australis/')).status, 'none')
  const differentOffset = diagnosePanic('AUP1;v=6;ip=0x40005678;kb=0x40000000;b=abc123456')
  assert.equal((await lookupKnownIssue(differentOffset, fakeFetch(db([entry()])), '/Australis/')).status, 'none')
})
test('page-fault access bits distinguish otherwise-identical sites', () => {
  const a = diagnosePanic('AUP1;v=14;e=0x0;ip=0x40001111;kb=0x40000000;b=abc123456')
  const b = diagnosePanic('AUP1;v=14;e=0x3;ip=0x40001111;kb=0x40000000;b=abc123456')
  assert.notEqual(crashSignature(a), crashSignature(b))
})
test('invalid, ambiguous and untrusted database records never claim a match', async () => {
  assert.equal((await lookupKnownIssue(report, fakeFetch(db([entry(),entry()])), '/Australis/')).status, 'unavailable')
  assert.equal((await lookupKnownIssue(report, fakeFetch(db([entry({ status: 'whatever' })])), '/Australis/')).status, 'unavailable')
  assert.equal((await lookupKnownIssue(report, fakeFetch({ schema:1, repository:'someone-else', issues:[entry()] }), '/Australis/')).status, 'unavailable')
  assert.equal((await lookupKnownIssue(report, fakeFetch(db([])), '/Australis/')).status, 'none')
})
test('format detection covers unrelated text, bad vector, and missing fields', () => {
  assert.equal(assessReport(diagnosePanic('https://example.com')).level, 'invalid')
  assert.equal(assessReport(diagnosePanic('AUP1;v=999;ip=0x100')).level, 'unsupported')
  assert.equal(assessReport(diagnosePanic('PANIC: allocation failed')).level, 'partial')
  assert.equal(assessReport(diagnosePanic('AUP1;v=6')).level, 'partial')
  assert.equal(assessReport(diagnosePanic('AUP1;v=6;ip=not-an-address')).level, 'partial')
  assert.equal(assessReport(report).level, 'complete')
})
test('guided recovery adapts to startup, launch, recurrence, and machine check', () => {
  const steps = recoveryPlan(report, context).join(' ')
  assert.match(steps, /USB devices/)
  assert.match(steps, /more than once/)
  assert.equal(normaliseContext({stage: 'untrusted input'}).stage, 'unknown')
  const machine = recoveryPlan(diagnosePanic('AUP1;v=18;ip=0x1234'), context).join(' ')
  assert.match(machine, /hardware or virtual-machine problem/)
})
test('safe export excludes raw data and private export is intentionally different', () => {
  const safe = safeDiagnosticText(report, context)
  assert.match(safe, /SAFE CRASH SUMMARY/)
  assert.doesNotMatch(safe, /40001234|4000BEEF|spooky-host|abc123456|KBASE|BUILD|RIP=/i)
  assert.match(safe, /During startup/)
  const privateText = technicalDiagnosticText(report, context)
  assert.match(privateText, /spooky-host/)
  assert.match(privateText, /40001234/)
})
test('GitHub draft includes only safe questionnaire answers and no raw payload', () => {
  const url = new URL(newIssueUrl(report, null, false, context))
  const body = url.searchParams.get('body')
  assert.match(body, /During startup/)
  assert.match(body, /Opening an application/)
  assert.match(body, /Happened more than once/)
  assert.doesNotMatch(body, /40001234|4000BEEF|spooky-host|abc123456|KBASE|BUILD/i)
})
test('custom strings cannot be injected as questionnaire answers', () => {
  const body = new URL(newIssueUrl(report, null, false, {stage: '<script>alert(1)</script>', activity:'private-host', recurrence:'private-host'})).searchParams.get('body')
  assert.doesNotMatch(body, /<script>|private-host/)
  assert.match(body, /Not sure/)
})
