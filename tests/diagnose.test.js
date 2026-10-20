import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnosePanic, SAMPLE_PANIC } from '../src/lib/diagnose.js'

test('recognises the actual Australis kernel panic test format', () => {
  const result = diagnosePanic(SAMPLE_PANIC)
  assert.equal(result.title, 'Page fault')
  assert.equal(result.vector, 14)
  assert.equal(result.fields.CR2, '0x0000000000000000')
  assert.equal(result.fields.RIP, '0x00000000001041F2')
  assert.match(result.findings.map((v) => v.value).join(' '), /Memory read/)
  assert.match(result.findings.map((v) => v.value).join(' '), /null page/)
})

test('recognises protection/write fault bits', () => {
  const result = diagnosePanic('AUP1;v=14;e=0x3;ip=0x1000;a=0xDEADBEEF')
  assert.equal(result.source, 'Australis AUP1 QR payload')
  assert.equal(result.fields.RIP, '0x1000')
  assert.match(result.findings.map((v) => v.value).join(' '), /Memory write/)
  assert.match(result.findings.map((v) => v.value).join(' '), /page was present/)
})

test('general-protection fault does not attribute fault address to CR2', () => {
  const result = diagnosePanic('VECTOR  =0x000000000000000D\nERROR   =0x0000000000000000\nRIP     =0x000000000010ABCD\nCR2 =0x0')
  assert.equal(result.title, 'General protection fault')
  assert.match(result.findings.map((v) => v.value).join(' '), /only meaningful for page faults/)
})

test('accepts JSON registers and message', () => {
  const result = diagnosePanic(JSON.stringify({ schema: 'AUP1', vector: 6, registers: { rip: '0xAFFA', rsp: '0x42' }, message: 'bad instruction' }))
  assert.equal(result.title, 'Invalid opcode')
  assert.equal(result.fields.RIP, '0xAFFA')
  assert.equal(result.fields.MESSAGE, 'bad instruction')
})

test('decodes URI-escaped compact fields', () => {
  const result = diagnosePanic('AUP1;v=13;e=0x0;ip=0xAB;m=noncanonical%20address')
  assert.equal(result.title, 'General protection fault')
  assert.equal(result.fields.MESSAGE, 'noncanonical address')
})

test('unrecognised QR text is not presented as a diagnosis', () => {
  const result = diagnosePanic('https://not-a-panic.example/hello')
  assert.equal(result.valid, false)
  assert.equal(result.title, 'No kernel panic recognised')
})

test('generic reason is surfaced with uncertainty', () => {
  const result = diagnosePanic('PANIC: allocator metadata corrupted')
  assert.equal(result.valid, true)
  assert.match(result.summary, /allocator metadata corrupted/)
  assert.match(result.certainty, /uncertain/)
})

test('input size and empty values are guarded', () => {
  assert.throws(() => diagnosePanic(''), /Paste/)
  assert.throws(() => diagnosePanic('x'.repeat(65537)), /too large/)
})
