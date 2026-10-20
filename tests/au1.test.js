import test from 'node:test'
import assert from 'node:assert/strict'
import { AU1_EXAMPLE, extractAu1, parseAu1 } from '../src/lib/au1.js'
import { diagnosePanic } from '../src/lib/diagnose.js'
import { assessReport } from '../src/lib/validation.js'
import { publicDiagnosis } from '../src/lib/public-diagnosis.js'
import { newIssueUrl, issueSearchQuery } from '../src/lib/issues.js'
import { crashSignature } from '../src/lib/known-issues.js'
import { safeDiagnosticText } from '../src/lib/reports.js'
import { DEFAULT_CONTEXT } from '../src/lib/recovery.js'
import { parsePgm, pgmToRgba } from '../src/lib/pgm.js'

const smoke = `Panic entry:   0xe0bc4c3
Scratch page:  0x1ba3000
QR marker:     0x51525354
QR result:     0
QR payload:    ${AU1_EXAMPLE}
QR dimensions: 29 x 29
Black modules: 432
SHA256:        d0de6f9c5af567aadabcb0652c6f21ce9163afa4b274256a9d8615a001e64e06
QR image:      build/panic-qr-debug.pgm`

test('AU1 smoke payload is recognised as generator test, not real CPU exception zero', () => {
  const qr = parseAu1(AU1_EXAMPLE)
  assert.equal(qr.kind, 'test')
  assert.equal(qr.header, '00')
  assert.equal(qr.words.length, 4)
  const report = diagnosePanic(AU1_EXAMPLE)
  assert.equal(report.valid, false)
  assert.equal(report.source, 'Australis AU1 QR payload')
  assert.equal(report.vector, null)
  assert.equal(report.fields.RIP, undefined)
  assert.equal(assessReport(report).level, 'test')
  assert.match(publicDiagnosis(report).description, /zero-filled/i)
})

test('pasted smoke transcript extracts only the QR content', () => {
  assert.equal(extractAu1(smoke), AU1_EXAMPLE)
  const report = diagnosePanic(smoke)
  assert.equal(report.inputStatus, 'test')
  assert.equal(report.vector, null)
})

test('AU1 nonzero data maps exactly to vector, error, RIP, RSP, CR2', () => {
  const qrText = 'AU1:06:0000000000001000:000000000001ABCD:00000000000FFFFF:000000000000000E'
  const parsed = parseAu1(qrText)
  assert.equal(parsed.kind, 'crash')
  assert.equal(parsed.header, '06')
  assert.equal(parsed.vector, 6)
  assert.deepEqual(parsed.words, [
    '0000000000001000', '000000000001ABCD', '00000000000FFFFF', '000000000000000E',
  ])
  const report = diagnosePanic(qrText)
  assert.equal(report.valid, true)
  assert.equal(report.format, 'AU1')
  assert.equal(report.source, 'Australis AU1 QR payload')
  assert.equal(report.vector, 6)
  assert.equal(report.fields.ERROR, '0x0000000000001000')
  assert.equal(report.fields.RIP, '0x000000000001ABCD')
  assert.equal(report.fields.RSP, '0x00000000000FFFFF')
  assert.equal(report.fields.CR2, '0x000000000000000E')
  assert.equal(report.title, 'Invalid opcode')
  assert.match(report.findings.map(x => x.value).join(' '), /CR2 is only meaningful for page faults/)
  assert.equal(assessReport(report).level, 'complete')
  assert.equal(crashSignature(report), null)
  assert.ok(newIssueUrl(report))
  assert.match(issueSearchQuery(report), /invalid opcode/)
})

test('AU1 real page-fault QR gets non-present memory-read diagnosis', () => {
  // Synthetic instruction and stack addresses; not taken from a real crash.
  const qrText = 'AU1:0E:0000000000000000:0000000000012345:0000000000023456:0000000000000000'
  const report = diagnosePanic(qrText)
  assert.equal(report.valid, true)
  assert.equal(report.vector, 14)
  assert.equal(report.title, 'Page fault')
  assert.equal(report.fields.ERROR, '0x0000000000000000')
  assert.equal(report.fields.CR2, '0x0000000000000000')
  assert.match(report.findings.map(x => x.value).join(' '), /Memory read/)
  assert.match(report.findings.map(x => x.value).join(' '), /page was not present/)
  assert.match(report.summary, /Address zero suggests a null pointer or the deliberate debug panic test/)
  assert.equal(assessReport(report).level, 'complete')
  assert.match(publicDiagnosis(report).description, /memory/i)
  const safe = safeDiagnosticText(report, DEFAULT_CONTEXT)
  assert.doesNotMatch(safe, /12345|23456|CR2|RIP|0x/i)
  const issueUrl = newIssueUrl(report)
  const issue = new URL(issueUrl)
  assert.match(issue.searchParams.get('body'), /Exception vector: 14/)
  assert.doesNotMatch(decodeURIComponent(issueUrl), /12345|23456|0x0000000000000000|RIP|CR2|RSP/)
  assert.equal(crashSignature(report), null) // no build ID / runtime code base
})

test('AU1 parses hex vector rather than decimal and preserves full 64-bit values', () => {
  const report = diagnosePanic('AU1:14:0000000000000000:FFFFFFFFFFFFFFFF:8000000000000000:0000000000000000')
  assert.equal(report.valid, true)
  assert.equal(report.vector, 20)  // hex 0x14, not decimal 14
  assert.equal(report.fields.RIP, '0xFFFFFFFFFFFFFFFF')
  assert.equal(report.fields.RSP, '0x8000000000000000')
  assert.equal(report.title, 'Virtualization exception')
})

test('AU1 preserves a real vector-zero event when CPU data are not all zero', () => {
  const report = diagnosePanic('AU1:00:0000000000000000:0000000000012345:0000000000023456:0000000000000000')
  assert.equal(report.valid, true)
  assert.equal(report.vector, 0)
  assert.equal(report.title, 'Divide error')
})

test('AU1 accepts case and optional spaces around colons in pasted data', () => {
  const spaced = 'au1 : 0e : 0000000000000003 : 0000000000012345 : 0000000000023456 : 0000000000000080'
  const report = diagnosePanic(spaced)
  assert.equal(report.vector, 14)
  assert.equal(report.title, 'Page fault')
  assert.match(report.findings.map(x => x.value).join(' '), /Memory write/)
  assert.match(report.findings.map(x => x.value).join(' '), /page was present/)
})

test('AU1 refuses out-of-range CPU exception without publishing an issue', () => {
  const report = diagnosePanic('AU1:80:0000000000000000:0000000000012345:0000000000023456:0000000000000000')
  assert.equal(report.valid, false)
  assert.equal(report.inputStatus, 'unsupported-vector')
  assert.equal(newIssueUrl(report), null)
})

test('truncated, corrupt and future QR versions are rejected without bogus diagnosis', () => {
  for (const text of ['AU1:00:0000000000000000', AU1_EXAMPLE.replace(':0000000000000000', ':bad'), 'AU2:06:FOO']) {
    const report = diagnosePanic(text)
    assert.equal(report.valid, false)
    assert.equal(report.vector, null)
    assert.equal(newIssueUrl(report), null)
  }
  assert.equal(parseAu1('AU1:00:0000000000000000').kind, 'malformed')
  assert.equal(parseAu1('AU2:06:FOO').kind, 'unsupported')
})

test('safe exports for unverified AU1 do not leak machine values', () => {
  const report = diagnosePanic(smoke)
  const safe = safeDiagnosticText(report, DEFAULT_CONTEXT)
  assert.doesNotMatch(safe, /e0bc4c3|1ba3000|d0de6f9c5a/i)
  assert.match(safe, /No supported Australis panic/)
})

test('PGM P2 handles comment and draws padded 8-bit QR pixels', () => {
  const data = new TextEncoder().encode('P2\n# test qr\n2 2\n255\n0 255\n255 0\n')
  const image = parsePgm(data.buffer)
  assert.equal(image.width, 2)
  assert.deepEqual(Array.from(image.pixels), [0, 255, 255, 0])
  const rgba = pgmToRgba(image)
  assert.equal(rgba.width, rgba.height)
  assert.equal(rgba.data[0], 255)
  const index = ((4 * 12) * rgba.width + (4 * 12)) * 4
  assert.equal(rgba.data[index], 0)
})

test('PGM P5 binary pixels and CRLF headers are decoded as bytes', () => {
  const header = new TextEncoder().encode('P5\r\n2 1\r\n255\r\n')
  const data = new Uint8Array([...header, 0, 255])
  const img = parsePgm(data.buffer)
  assert.deepEqual([...img.pixels], [0, 255])
  assert.throws(() => parsePgm(data.buffer.slice(0, -1)), /missing|length/i)
  assert.throws(() => parsePgm(new TextEncoder().encode('P5\n4001 1\n255\n').buffer), /unsupported/)
})
