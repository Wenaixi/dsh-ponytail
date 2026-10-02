import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'

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

// description 长度静态断言：官方 dsh-tool-skill 默认 catalogDescriptionMaxLength=500，
// 超长会被模型目录截断，压缩不得回退（防回归）。
// 长度按真实 YAML 折叠块语义计算（description: > 后的连续缩进行归一 join，含折叠块末尾换行），
// 与运行时 parseFrontmatter 使用同一 yaml.parse，保证断言与投产值一致。
const DESC_MAX = 500
for (const dir of skillDirs) {
  const p = join(skillDir, dir, 'SKILL.md')
  const rawNorm = (await readFile(p, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = rawNorm.split('\n')
  const end = lines.indexOf('---', 1)
  if (end < 0) continue
  let desc = ''
  try {
    const fm = parse(lines.slice(1, end).join('\n'))
    if (typeof fm?.description !== 'string') throw new Error('description 非字符串')
    desc = fm.description
  } catch (err) {
    console.error(`[verify] ${dir}: description 解析失败：${err instanceof Error ? err.message : String(err)}`)
    ok = false
    continue
  }
  if (desc.length > DESC_MAX) {
    console.error(`[verify] ${dir}: description ${desc.length} chars > ${DESC_MAX} (will be truncated by model catalog)`)
    ok = false
  } else {
    console.log(`[verify] ✓ ${dir} description ${desc.length} chars`)
  }
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
  'lib/ponytail-commands.js',
  'lib/ponytail-config.js',
  'lib/ponytail-instructions.js',
  'lib/ponytail-runtime.js',
  'lib/ponytail-skills.js',
  'lib/ponytail-state.js',
  'lib/client.js',
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

// 不应注册任何 tool 的静态检查：src/ 全部 .ts 中不应出现 ctx.tools.register 或 defineTool
// （扫描整个 src/ 而非单文件，保证新增模块（如 ponytail-state.ts）也在覆盖内）
const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')
let badTool = null
for (const f of (await readdir(srcDir)).filter(f => f.endsWith('.ts'))) {
  const code = await readFile(join(srcDir, f), 'utf8')
  const m = code.match(/\btools\s*\.\s*register\b|\bdefineTool\b/i)
  if (m) { badTool = `${f}: ${m[0]}`; break }
}
if (badTool) { console.error(`[verify] FAIL: found tool registration (must not register tools): ${badTool}`); ok = false }
else console.log('[verify] ✓ no tool registration')

// 检查 cordis.patch.yml 引用包名而非绝对路径
const patch = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.patch.yml'), 'utf8')
if (patch.includes('dsh-ponytail') && !patch.includes('/absolute')) console.log('[verify] ✓ cordis.patch.yml uses package name')
else { console.error('[verify] cordis.patch.yml not referencing dsh-ponytail by package name'); ok = false }

// 跨平台路径门禁（见 docs/adr/0005）：
// 存储路径必须由 DSH 数据根解析得出，不得出现平台判断或平台特定路径字面量。
// 唯一豁免是 getLegacyConfigDir() 的旧位置兼容读取分支——它必须保留旧平台约定，
// 因此扫描时排除该函数体，其余位置出现即判失败。
const legacyCompatSrc = await readFile(join(srcDir, 'ponytail-config.ts'), 'utf8')
const legacyFnStart = legacyCompatSrc.indexOf('export function getLegacyConfigDir')
const legacyFnEnd = legacyCompatSrc.indexOf('export function getLegacyConfigPath')
const legacyCompatSource =
  legacyFnStart >= 0 && legacyFnEnd > legacyFnStart
    ? legacyCompatSrc.slice(legacyFnStart, legacyFnEnd)
    : legacyCompatSrc

const platformPathPattern = /%APPDATA%|XDG_CONFIG_HOME|process\.platform|\.config[\\/]ponytail|AppData[\\/]Roaming/
const offenders = []
for (const f of (await readdir(srcDir)).filter(f => f.endsWith('.ts'))) {
  const code = (await readFile(join(srcDir, f), 'utf8')).replace(legacyCompatSource, '')
  const m = code.match(platformPathPattern)
  if (m) offenders.push(`src/${f}: ${m[0]}`)
}
// 客户端面板文案同样不得出现平台特定路径（唯一来源为构建期脚本，产物同源）
for (const rel of ['scripts/build-client.mjs', 'lib/client.js']) {
  const code = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '..', rel), 'utf8')
  const m = code.match(/%APPDATA%|XDG_CONFIG_HOME/)
  if (m) offenders.push(`${rel}: ${m[0]}`)
}
if (offenders.length > 0) {
  console.error(`[verify] FAIL: platform-specific path literal found (must resolve via DSH home): ${offenders.join(', ')}`)
  ok = false
} else console.log('[verify] ✓ no platform-specific path literals')

console.log(`\n[verify] ${ok ? 'ALL PASS' : 'FAIL'}`)
process.exit(ok ? 0 : 1)
