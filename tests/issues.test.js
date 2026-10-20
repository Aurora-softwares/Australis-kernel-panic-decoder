import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnosePanic } from '../src/lib/diagnose.js'
import { publicDiagnosis } from '../src/lib/public-diagnosis.js'
import { ISSUE_REPO, issueSearchQuery, newIssueUrl, searchPublicIssues, issueSearchPage } from '../src/lib/issues.js'

const raw = `*** AUSTRALIS KERNEL PANIC ***\nVECTOR =0x6\nRIP=0xDEADBEEF\nRSP=0xBADCAFE\nMESSAGE=secret internal value`
const result = diagnosePanic(raw)

test('public explanation does not disclose raw crash information', () => {
  const summary = JSON.stringify(publicDiagnosis(result))
  assert.match(summary, /could not execute an instruction/)
  assert.doesNotMatch(summary, /DEADBEEF|BADCAFE|secret internal/i)
})

test('search query includes only bounded public exception classification', () => {
  const query = issueSearchQuery(result)
  assert.match(query, /repo:Aurora-softwares\/Australis-OS/)
  assert.match(query, /invalid opcode/)
  assert.doesNotMatch(query, /DEADBEEF|BADCAFE|secret/i)
  assert.ok(issueSearchPage(result).startsWith(`https://github.com/${ISSUE_REPO}/issues?`))
})

test('new issue template excludes all raw values and does not require OS version', () => {
  const url = new URL(newIssueUrl(result))
  assert.equal(url.origin, 'https://github.com')
  assert.match(url.searchParams.get('title'), /invalid opcode/)
  assert.match(url.searchParams.get('body'), /Exception vector: 6/)
  assert.doesNotMatch(decodeURIComponent(url.href), /DEADBEEF|BADCAFE|secret internal/)
  assert.doesNotMatch(url.searchParams.get('body'), /Required version/)
})

test('issue API searches only generic type and restricts returned URLs', async () => {
  const issues = await searchPublicIssues(result, async (url) => {
    assert.doesNotMatch(url, /DEADBEEF|BADCAFE|secret/i)
    assert.match(decodeURIComponent(url), /invalid opcode/)
    return {
      ok: true,
      json: async () => ({ items: [
        { number: 12, title: 'Unexpected invalid opcode', html_url: `https://github.com/${ISSUE_REPO}/issues/12`, state: 'closed' },
        { number: 13, title: 'Phishing link', html_url: 'https://attacker.example.com', state: 'open' },
      ] }),
    }
  })
  assert.equal(issues.length, 1)
  assert.equal(issues[0].state, 'closed')
})

test('does not search if there was no valid kernel panic', async () => {
  assert.equal(issueSearchQuery(diagnosePanic('hello')), null)
  assert.equal(newIssueUrl(diagnosePanic('hello')), null)
  assert.deepEqual(await searchPublicIssues(diagnosePanic('hello'), () => { throw Error('should not fetch') }), [])
})
