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

test('AU1 nonzero data parses without guessing header or 64-bit word meanings', () => {
  const qrText = 'AU1:06:0000000000001000:000000000001ABCD:00000000000FFFFF:000000000000000E'
  const parsed = parseAu1(qrText)
  assert.equal(parsed.kind, 'unmapped')
  assert.equal(parsed.header, '06')
  assert.equal(parsed.words.length, 4)
  const report = diagnosePanic(qrText)
  assert.equal(report.valid, false)
  assert.equal(report.vector, null)
  assert.deepEqual(report.fields, {})
  assert.equal(crashSignature(report), null)
  assert.equal(newIssueUrl(report), null)
  assert.equal(issueSearchQuery(report), null)
  assert.match(publicDiagnosis(report).guidance, /serial panic/i)
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
