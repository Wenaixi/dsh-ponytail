import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
console.log(`[verify] skillDir: ${skillDir}`)

const entries = await readdir(skillDir, { withFileTypes: true })
const skillDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort()
console.log(`[verify] found ${skillDirs.length} skill directories: ${skillDirs.join(', ')}`)

let ok = true
for (const dir of skillDirs) {
  const p = join(skillDir, dir, 'SKILL.md')
  try { await stat(p) } catch { console.error(`[verify] MISSING ${p}`); ok = false; continue }
  const rawNorm = (await readFile(p, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const hasFrontmatter = rawNorm.startsWith('---\n') && rawNorm.includes('\n---\n')
  const nameMatch = rawNorm.match(/name:\s*([a-z0-9-]+)/)
  const descMatch = rawNorm.match(/description:\s*["']?(.+)["']?/)
  if (!hasFrontmatter) { console.error(`[verify] ${dir}: missing frontmatter`); ok = false }
  else if (!nameMatch) { console.error(`[verify] ${dir}: missing name`); ok = false }
  else console.log(`[verify] ✓ ${dir} -> ${nameMatch[1]} ${descMatch ? `(${descMatch[1].slice(0,60)})` : ''}`)
}

console.log(`\n[verify] expected 6 skills, found ${skillDirs.length} -> ${skillDirs.length === 6 ? 'PASS' : 'FAIL'}`)
if (skillDirs.length !== 6) ok = false

const expected = ['ponytail', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review']
for (const n of expected) {
  if (!skillDirs.includes(n)) { console.error(`[verify] missing expected skill: ${n}`); ok = false }
}

// 额外检查 lib 产出与关键文件
const checks = [
  'lib/ponytail.js',
  'lib/ponytail-config.js',
  'lib/ponytail-instructions.js',
  'lib/ponytail-runtime.js',
  'cordis.patch.yml',
  'package.json',
  'skills/ponytail/SKILL.md',
  'skills/ponytail-review/SKILL.md',
  'AGENTS.md',
]
for (const rel of checks) {
  const p = resolve(dirname(fileURLToPath(import.meta.url)), '..', rel)
  try { await stat(p); console.log(`[verify] ✓ ${rel}`) } catch { console.error(`[verify] MISSING ${rel}`); ok = false }
}

// 不应注册空 tool 的静态检查：源码中不应出现 ctx.tools.register 或 defineTool
const src = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src/ponytail.ts'), 'utf8')
const badTool = src.match(/\btools\s*\.\s*register\b|\bdefineTool\b/i)
if (badTool) { console.error(`[verify] FAIL: found tool registration (must not have empty tools): ${badTool[0]}`); ok = false }
else console.log('[verify] ✓ no empty tool registration')

// 检查 cordis.patch.yml 引用包名而非绝对路径
const patch = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.patch.yml'), 'utf8')
if (patch.includes('dsh-ponytail') && !patch.includes('/absolute')) console.log('[verify] ✓ cordis.patch.yml uses package name')
else { console.error('[verify] cordis.patch.yml not referencing dsh-ponytail by package name'); ok = false }

console.log(`\n[verify] ${ok ? 'ALL PASS' : 'FAIL'}`)
process.exit(ok ? 0 : 1)
