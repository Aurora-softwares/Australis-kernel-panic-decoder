import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exceptionReference, exceptionByVector } from '../src/lib/exception-reference.js'
import { decodePageFault } from '../src/lib/page-fault.js'
import { localCrashSignature } from '../src/lib/crash-signature.js'
import { identifyBootStage } from '../src/lib/boot-stage.js'
import { historyEnabled, setHistoryEnabled, loadHistory, recordHistory, clearHistory, signatureOccurrences } from '../src/lib/history.js'
import { redactLog, attachmentInstructions } from '../src/lib/attachments.js'
import { lookupKnownIssue } from '../src/lib/known-issues.js'
import { newIssueUrl } from '../src/lib/issues.js'
import { diagnosePanic } from '../src/lib/diagnose.js'
import { safeDiagnosticText } from '../src/lib/reports.js'

const QR = 'AU1:0E:0000000000000000:0000000000012345:0000000000023456:0000000000000000'
const report = diagnosePanic(QR)
const another = diagnosePanic('AU1:0E:0000000000000003:0000000000012345:0000000000023456:0000000000000050')

function storage() {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key,value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    dump: () => JSON.stringify([...data.entries()]),
  }
}

test('CPU reference covers every 0..31 vector and Australis unexpected interrupt', () => {
  assert.equal(exceptionReference.length, 33)
  assert.equal(new Set(exceptionReference.map(x => x.vector)).size, 33)
  for (let i=0;i<32;i++) assert.ok(exceptionByVector(i))
  assert.match(exceptionByVector(14).explanation, /memory/i)
  assert.match(exceptionByVector(6).name, /Invalid opcode/)
  assert.match(exceptionByVector(8).explanation, /another exception/i)
  assert.equal(exceptionByVector(9).reserved, true)
  assert.equal(exceptionByVector(255).reserved, false)
  assert.equal(exceptionByVector(256), null)
})
test('page-fault decodes AU1 with zero error as supervisor read of absent page', () => {
  const decoded = decodePageFault(report)
  assert.ok(decoded.available)
  assert.match(decoded.summary, /Memory read/)
  assert.match(decoded.summary, /Page not present/)
  assert.match(decoded.summary, /Supervisor/)
  assert.equal(decoded.flags.find(x => x.bit === 0).set, false)
  assert.doesNotMatch(decoded.summary, /0x0000000000012345/)
})
test('page-fault distinguishes protection violation, write, user, instruction, and special flags', () => {
  const decoded = decodePageFault(diagnosePanic('AUP1;v=14;e=0x807f;ip=0x12345;a=0x80'))
  assert.match(decoded.summary, /Instruction fetch/)
  assert.match(decoded.summary, /Protection violation/)
  assert.match(decoded.summary, /User-mode/)
  assert.equal(decoded.flags.find(x => x.bit === 1).set, true)
  assert.equal(decoded.flags.find(x => x.bit === 6).set, true)
  assert.equal(decoded.flags.find(x => x.bit === 15).set, true)
  assert.equal(decodePageFault(diagnosePanic('AUP1;v=6;ip=0x100')), null)
  assert.equal(decodePageFault(diagnosePanic('AUP1;v=14;ip=0x100')).available, false)
})
test('fingerprint repeats for identical scans and changes with RIP or error type', () => {
  const a = localCrashSignature(report), b = localCrashSignature(diagnosePanic(QR))
  assert.deepEqual(a, b)
  assert.match(a.code, /^AU-[A-F0-9]{16}$/)
  assert.equal(a.precision, 'address-based')
  assert.notEqual(a.code, localCrashSignature(another).code)
  assert.equal(localCrashSignature(diagnosePanic('hello')), null)
  const build = localCrashSignature(diagnosePanic('AUP1;v=6;ip=0x40001234;kb=0x40000000;b=abc12345'))
  assert.equal(build.precision,'build-aware')
  assert.notEqual(build.code,a.code)
})
test('boot stage uses explicit reported metadata, never invents an AU1 stage', () => {
  assert.equal(identifyBootStage(report).confidence, 'unknown')
  assert.equal(identifyBootStage(report,{stage:'startup'}).confidence, 'user')
  assert.equal(identifyBootStage(diagnosePanic('AUP1;v=6;ip=0x1234;stage=filesystem')).title, 'Filesystem startup')
  assert.equal(identifyBootStage(diagnosePanic('PANIC: example\nVECTOR=0x6\nRIP=0x1234\nBOOT_STAGE=drivers')).title, 'Device initialization')
  assert.equal(identifyBootStage(diagnosePanic('AUP1;v=6;ip=0x1234;stage=private-host')).confidence, 'unknown')
})
test('history is OFF by default; records minimal information only after explicit opt-in', () => {
  const st = storage()
  assert.equal(historyEnabled(st),false)
  assert.deepEqual(recordHistory(st,report,12345),[])
  assert.equal(st.dump(),'[]')
  assert.equal(setHistoryEnabled(st,true),true)
  assert.equal(historyEnabled(st),true)
  const added=recordHistory(st,report,12345)
  assert.equal(added.length,1)
  assert.equal(signatureOccurrences(added,localCrashSignature(report)),1)
  assert.doesNotMatch(st.dump(),/0000000000012345|0000000000023456|0x|AU1:|CR2|RIP|RSP/)
  assert.deepEqual(loadHistory(st),added)
  clearHistory(st)
  assert.deepEqual(loadHistory(st),[])
  recordHistory(st,report,12345)
  setHistoryEnabled(st,false)
  assert.equal(historyEnabled(st),false)
  assert.deepEqual(loadHistory(st),[])
})
test('history stays bounded, tolerates disabled storage, and ignores malformed records', () => {
  const st=storage()
  setHistoryEnabled(st,true)
  for(let i=0;i<30;i++) recordHistory(st,report,1000+i)
  assert.equal(loadHistory(st).length,25)
  assert.equal(loadHistory(st)[0].at,1029)
  assert.deepEqual(loadHistory({getItem:k => k.includes('consent')?'yes':'broken'}),[])
  assert.equal(historyEnabled({getItem(){throw Error('denied')}}),false)
})
test('known-fix links are opt-in curated and restrict to official repository', async () => {
  const exact=diagnosePanic('AUP1;v=6;ip=0x40001234;kb=0x40000000;b=abc123456')
  const entry={signature:'sig1:abc123456:v6:o1234:e0',issue:42,status:'resolved',title:'Crash at a test site',summary:'Reviewed',recovery:'Read the linked fix'}
  const db = item => ({ schema:1, repository:'Aurora-softwares/Australis-OS', issues:[item] })
  const fetcher = item => async () => ({ok:true,json:async()=>db(item)})
  const valid = await lookupKnownIssue(exact,fetcher({...entry, fix:{ releaseUrl:'https://github.com/Aurora-softwares/Australis-OS/releases/tag/v0.0.1', commitUrl:'https://github.com/Aurora-softwares/Australis-OS/commit/'+'a'.repeat(40),instructions:'Upgrade from the verified release.' }}),'/')
  assert.equal(valid.status,'matched')
  assert.match(valid.match.fix.releaseUrl,/releases\/tag/)
  assert.match(valid.match.fix.commitUrl,/commit/)
  const unsafe = await lookupKnownIssue(exact,fetcher({...entry, fix:{ releaseUrl:'https://evil.example/release',commitUrl:'https://evil.example/fix',instructions:'' }}),'/')
  assert.equal(unsafe.status,'matched')
  assert.equal(unsafe.match.fix,null)
  const onlyClosed = await lookupKnownIssue(exact,fetcher(entry),'/')
  assert.equal(onlyClosed.match.fix,null)
})
test('best-effort text redaction plus explicit manual attachment safeguards', () => {
  const leak='RIP=0x12345\nuser@example.org 192.168.1.15 /home/private/secret.txt https://example.com/abc?token=foo password=letmein\nRAX = 12345'
  const scrub=redactLog(leak)
  for (const sensitive of ['0x12345','user@example.org','192.168.1.15','/home/private','https://example.com','letmein','RAX = 12345']) {
    assert.ok(!scrub.includes(sensitive),sensitive)
  }
  assert.match(scrub,/REDACTED/)
  assert.match(attachmentInstructions().join(' '), /review/i)
  const url=new URL(newIssueUrl(report))
  const body=url.searchParams.get('body')
  assert.match(body,/manual attachment only/i)
  assert.doesNotMatch(body,/0x0000000000012345|192\.168|password=/)
  assert.doesNotMatch(safeDiagnosticText(report,{}),/AU-[0-9A-F]{16}/)
})
test('PWA has scoped manifest, install icons, offline cache and excludes user panic inputs', () => {
  const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'))
  const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8')
  const vite=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8')
  assert.equal(manifest.display,'standalone')
  assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'))
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'))
  assert.match(vite,/icon-512\.png/)
  assert.match(sw,/precache-manifest\.json/)
  assert.match(sw,/event\.request\.mode === 'navigate'/)
  assert.match(sw,/const isPublicLookup = url\.href === knownDB/)
  assert.match(sw,/event\.respondWith\(caches\.match\(event\.request\)\.then\(cached => cached \|\| fetch\(event\.request\)\)\)/)
})

test('GitHub Pages deploys only from Release, never from Development or a manual non-Release run', () => {
  const deploy = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')
  const ci = readFileSync(new URL('../.github/workflows/development-checks.yml', import.meta.url), 'utf8')
  assert.match(deploy, /push:\s*\n\s*branches:\s*\[Release\]/)
  assert.doesNotMatch(deploy, /branches:\s*\[(?:main|Development)\]/)
  assert.equal((deploy.match(/if:\s*github\.ref\s*==\s*'refs\/heads\/Release'/g) || []).length, 2)
  assert.match(deploy, /uses: actions\/deploy-pages@v4/)
  assert.match(ci, /push:\s*\n\s*branches:\s*\[Development\]/)
  assert.match(ci, /pull_request:\s*\n\s*branches:\s*\[Release\]/)
  assert.doesNotMatch(ci, /deploy-pages|pages: write|upload-pages-artifact/)
})
