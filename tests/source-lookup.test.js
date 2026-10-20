import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnosePanic } from '../src/lib/diagnose.js'
import { lookupSource, issueSafeSource } from '../src/lib/source-lookup.js'
import { newIssueUrl, issueSearchQuery } from '../src/lib/issues.js'

const build = 'abcd1234'
const commit = 'a'.repeat(40)
const input = `AUP1;v=6;e=0;ip=0x30001008;kb=0x30000000;b=${build}`
const report = diagnosePanic(input)
const sourceMap = {
  schema: 1, repository: 'Aurora-softwares/Australis-OS', build, commit,
  entries: [{ start: '0x1000', end: '0x1020', path: 'src/kernel/KernelMain.hy', line: 12, snippetStart: 10,
    snippet: ['public class KernelMain {', '    // public example', '    public static void Run() {', '        return;', '    }'], precision: 'line', symbol: 'KernelMain.Run' }],
}
function fakeFetch(url) {
  if (url === '/symbols/index.json') return Promise.resolve({ok:true,json:async()=>({schema:1,builds:[build]})})
  if (url === `/symbols/${build}.json`) return Promise.resolve({ok:true,json:async()=>sourceMap})
  throw new Error('Unexpected request '+url)
}

test('AUP1 parser supports optional build fingerprint and runtime code base', () => {
  assert.equal(report.fields.BUILD, build)
  assert.equal(report.fields.KBASE, '0x30000000')
  assert.equal(report.fields.RIP, '0x30001008')
  const text = diagnosePanic('*** AUSTRALIS KERNEL PANIC ***\nVECTOR=0x6\nRIP=0x30001008\nKBASE=0x30000000\nBUILD=abcd1234')
  assert.equal(text.fields.KBASE, '0x30000000')
})

test('automatically matches only exact build, base, address range and public source', async () => {
  const output = await lookupSource(report, fakeFetch)
  assert.equal(output.status, 'matched')
  assert.equal(output.location.line, 12)
  assert.equal(output.location.precision, 'line')
  assert.equal(output.location.offset, '0x1008')
  assert.equal(output.location.url, `https://github.com/Aurora-softwares/Australis-OS/blob/${commit}/src/kernel/KernelMain.hy#L12`)
})

test('never looks up source without a matching build fingerprint', async () => {
  const unversioned = diagnosePanic('AUP1;v=6;ip=0x30001008;kb=0x30000000')
  assert.equal((await lookupSource(unversioned,()=>{throw Error('unexpected fetch')})).status,'no-build')
})

test('requires runtime code base unless map explicitly pins it', async () => {
  const noBase = diagnosePanic('AUP1;v=6;ip=0x30001008;b=abcd1234')
  assert.equal((await lookupSource(noBase,fakeFetch)).status,'no-base')
})

test('refuses invalid or ambiguous source ranges and does not guess', async () => {
  const outside = diagnosePanic(`AUP1;v=6;ip=0x30003008;kb=0x30000000;b=${build}`)
  assert.equal((await lookupSource(outside,fakeFetch)).status,'not-found')
  const invalid = (url) => url.endsWith('index.json') ? Promise.resolve({ok:true,json:async()=>({schema:1,builds:[build]})}) :
    Promise.resolve({ok:true,json:async()=>({...sourceMap,entries:[{...sourceMap.entries[0],path:'../../secrets.txt'}]})})
  assert.equal((await lookupSource(report,invalid)).status,'error')
  const wrong = (url) => url.endsWith('index.json') ? Promise.resolve({ok:true,json:async()=>({schema:1,builds:[build]})}) :
    Promise.resolve({ok:true,json:async()=>({...sourceMap, build:'otherbuild'})})
  assert.equal((await lookupSource(report,wrong)).status,'error')
})

test('GitHub issue contains public source only after opt-in and never contains private RIP/KBASE', async () => {
  const source = await lookupSource(report,fakeFetch)
  const before = decodeURIComponent(newIssueUrl(report,source))
  assert.doesNotMatch(before,/KernelMain\.hy|public example|30001008|30000000|abcd1234/)
  assert.match(before,/Exception vector: 6/)
  const opted = new URL(newIssueUrl(report,source,true))
  const body = opted.searchParams.get('body')
  assert.match(body,/src\/kernel\/KernelMain\.hy:12/)
  assert.match(body,/public example/)
  assert.match(body,/not a confirmed root cause/i)
  assert.doesNotMatch(body,/30001008|30000000|RIP|KBASE|secret internal/i)
  assert.doesNotMatch(issueSearchQuery(report),/30001008|30000000|abcd1234/)
  assert.equal(issueSafeSource({status:'matched',location:{...source.location,file:'src/private/passwords.env'}}),null)
})

test('source lookup cannot fetch attacker-specified remote domains from QR', async () => {
  const hostile = diagnosePanic('AUP1;v=6;ip=0x30001008;kb=0x30000000;b=https://evil.example/')
  assert.equal((await lookupSource(hostile,()=>{throw Error('unexpected fetch')})).status,'no-build')
})
