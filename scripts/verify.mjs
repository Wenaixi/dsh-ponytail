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

// UI 落点门禁：本插件只在「插件卡片详情」提供配置面板（plugins.bundle.config，key 为包名）。
// 2026-10-04 实测确认：宿主 listBundles 的 name 即包名，卡片详情页按 entryKey 匹配即可命中。
// 禁止再往 settings.section / sidebar.footer.action / shell.overlay / plugins.item 等位置加落点——
// 那些会让同一个面板在设置窗口、侧边栏、插件页重复出现，属用户明确拒绝的 UI 污染。
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const clientSrc = await readFile(join(rootDir, 'scripts', 'build-client.mjs'), 'utf8')
const slotCalls = [...clientSrc.matchAll(/ctx\.slots\.inject\("([^"]+)"/g)].map((m) => m[1])
const allowed = ['plugins.bundle.config']
const extra = slotCalls.filter((s) => !allowed.includes(s))
if (extra.length > 0) {
  console.error('[verify] FAIL: 出现多余 UI 落点 ' + extra.join(', ') + '（会让面板在多个位置重复出现）')
  ok = false
} else if (!clientSrc.includes('key: "@wenaixi/dsh-ponytail"')) {
  console.error('[verify] FAIL: plugins.bundle.config 未以包名为 key 注册')
  ok = false
} else {
  console.log('[verify] ✓ client registers exactly one UI slot: plugins.bundle.config (key = 包名)')
}
// 宿侧必须注册 settings 命名空间：插件页据此为 ponytail serve 配置表单
const hostSrc = await readFile(join(rootDir, 'src', 'ponytail.ts'), 'utf8')
if (hostSrc.includes("service.register('ponytail'")) {
  console.log('[verify] ✓ host registers settings namespace "ponytail"')
} else {
  console.error('[verify] FAIL: host 必须调用 settings.register("ponytail", Config)，否则设置界面不出现本插件')
  ok = false
}

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
