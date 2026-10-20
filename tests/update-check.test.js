import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePublishedBuild, isNewBuild, fetchPublishedBuild, applyWebsiteUpdate } from '../src/lib/update-check.js'

test('accepts a published build with a safe ID and semantic version', () => {
  assert.deepEqual(parsePublishedBuild({ version: '2.5.1', buildId: 'abcdef1234' }), { version: '2.5.1', buildId: 'abcdef1234' })
})

test('rejects missing, invalid or unsafe published build metadata', () => {
  for (const value of [null, [], {}, { version: '2.5.1', buildId: '../attack' }, {version:'not-version', buildId:'abcdef1234'}, {version:'2.5.1', buildId:'a'}]) {
    assert.equal(parsePublishedBuild(value), null)
  }
})

test('detects a different Release commit even at the same display version', () => {
  assert.equal(isNewBuild('oldbuild01', { version:'2.5.1', buildId:'newbuild02' }), true)
  assert.equal(isNewBuild('oldbuild01', { version:'2.5.1', buildId:'oldbuild01' }), false)
  assert.equal(isNewBuild('', { version:'2.5.1', buildId:'newbuild02' }), false)
})

test('requests an uncached GitHub Pages project manifest without private diagnostics', async () => {
  let called
  const fetcher = async (url, opts) => {
    called = { url, opts }
    return { ok:true, json:async ()=>({version:'2.5.1', buildId:'newbuild02'}) }
  }
  const info = await fetchPublishedBuild(fetcher, '/Australis-kernel-panic-decoder/', { nonce:42 })
  assert.equal(called.url, '/Australis-kernel-panic-decoder/version.json?update=42')
  assert.equal(called.opts.cache, 'no-store')
  assert.deepEqual(info,{version:'2.5.1', buildId:'newbuild02'})
})

test('ignores a failed or invalid manifest without treating it as a new version', async () => {
  assert.equal(await fetchPublishedBuild(async ()=>({ok:false}), '/'), null)
  assert.equal(await fetchPublishedBuild(async ()=>({ok:true,json:async ()=>({ buildId:'abc' })}), '/'), null)
})

test('refreshes the service worker before a cache-busting reload', async () => {
  const calls=[]
  const loc={ href:'https://example.com/Australis-kernel-panic-decoder/?theme=dark', replace:v=>calls.push(v) }
  const nav={serviceWorker:{getRegistration: async ()=>({update:async()=>calls.push('refresh')})}}
  await applyWebsiteUpdate({navigatorObject:nav,locationObject:loc,buildId:'newbuild02'})
  assert.equal(calls[0], 'refresh')
  assert.match(calls[1], /website-update=newbuild02/)
  assert.match(calls[1], /theme=dark/)
})
