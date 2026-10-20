#!/usr/bin/env node
/**
 * Convert an instruction-offset symbol list into a curated, commit-pinned,
 * public map for GitHub Pages. Input offsets must be emitted/verified against
 * the exact KERNEL.BIN; never infer them from source or RIP alone.
 *
 * node tools/publish-source-map.mjs --map kernel-symbols.json \
 *   --repo ../Australis-OS --out public/symbols
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { parseAddress, PUBLIC_SOURCE_REPO } from '../src/lib/source-lookup.js'

const parameters = Object.fromEntries(process.argv.slice(2).reduce((pairs, entry, i, args) => {
  if (entry.startsWith('--') && args[i+1] && !args[i+1].startsWith('--')) pairs.push([entry, args[i+1]])
  return pairs
}, []))
const mapFile = parameters['--map']
const sourceRepo = parameters['--repo']
const targetFolder = parameters['--out'] ?? 'public/symbols'
if (!mapFile || !sourceRepo) {
  console.error('Usage: node tools/publish-source-map.mjs --map exported-addresses.json --repo path/to/Australis-OS [--out public/symbols]')
  process.exit(2)
}
const SHA = /^[a-f0-9]{40}$/i
const BUILD = /^[a-z0-9][a-z0-9._-]{5,63}$/i
const FILE = /^src\/kernel\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.hy$/
const input = JSON.parse(await readFile(mapFile, 'utf8'))
if (input.schema !== 1 || !BUILD.test(input.build) || !SHA.test(input.commit) ||
  !Array.isArray(input.entries) || !input.entries.length || input.entries.length > 200000) {
  throw Error('Invalid map; supply schema=1, build, 40-character public commit and source ranges')
}
const cwd = resolve(sourceRepo)
const git = (...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 5*1024*1024 })
const url = git('remote', 'get-url', 'origin').trim()
if (!/^((https:\/\/github\.com\/)|(git@github\.com:))Aurora-softwares\/Australis-OS(?:\.git)?$/i.test(url)) {
  throw Error('Only the public Aurora-softwares/Australis-OS origin may be used')
}
git('cat-file', '-e', `${input.commit}^{commit}`)
const sourceCache = new Map()
const entries = []
let previous = null
for (const item of input.entries) {
  const start = parseAddress(item.start)
  const end = parseAddress(item.end)
  if (start === null || end === null || start >= end ||
    (previous !== null && start < previous) || !FILE.test(item.path) ||
    !['line','function'].includes(item.precision) || !Number.isSafeInteger(item.line) || item.line < 1 ||
    (item.symbol && !/^[A-Za-z_][A-Za-z0-9_.:]{0,95}$/.test(item.symbol))) {
    throw Error(`Invalid/overlapping instruction mapping: ${JSON.stringify(item)}`)
  }
  previous = end
  if (!sourceCache.has(item.path)) {
    sourceCache.set(item.path, git('show', `${input.commit}:${item.path}`).replace(/\r\n/g,'\n').split('\n'))
  }
  const lines = sourceCache.get(item.path)
  if (item.line > lines.length) throw Error(`Out-of-range source location: ${item.path}:${item.line}`)
  const snippetStart = Math.max(1, item.line - 2)
  const snippet = lines.slice(snippetStart - 1, Math.min(lines.length, item.line + 2))
  if (snippet.some(line => line.length > 200)) throw Error('Source snippet has very long lines; shorten/map another line')
  entries.push({ start: `0x${start.toString(16)}`, end: `0x${end.toString(16)}`,
    path: item.path, line: item.line, precision: item.precision,
    ...(item.symbol ? { symbol: item.symbol } : {}), snippetStart, snippet })
}
const output = { schema:1, build:input.build, repository:PUBLIC_SOURCE_REPO, commit:input.commit,
  ...(input.fixedCodeBase ? { fixedCodeBase: input.fixedCodeBase } : {}), entries }
const folder = resolve(targetFolder)
await mkdir(folder, { recursive:true })
const indexPath = join(folder, 'index.json')
let index = { schema:1, builds:[] }
try { index = JSON.parse(await readFile(indexPath,'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
if (index.schema !== 1 || !Array.isArray(index.builds) || index.builds.some(x => !BUILD.test(x))) throw Error('Invalid existing index.json')
index.builds = [...new Set([...index.builds, input.build])].sort()
await writeFile(join(folder, `${input.build}.json`), JSON.stringify(output, null, 2)+'\n')
await writeFile(indexPath, JSON.stringify(index, null, 2)+'\n')
console.log(`Published ${entries.length} address ranges for build ${input.build}; source pinned to ${input.commit}`)
