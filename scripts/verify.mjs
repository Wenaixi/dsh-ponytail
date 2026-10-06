import { existsSync } from 'node:fs'
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

// 技能描述长度断言：官方 dsh-tool-skill 的 catalogDescriptionMaxLength 默认 500
// （dsh-tool-skill/lib/index.js:52），超长会在模型目录里被截断成 "...", 触发词可能整段丢失。
// 断言对象是 skills/descriptions.{lang}.json —— 那才是真正下发给模型目录的字符串；
// SKILL.md frontmatter 的 description 是上游原文（可超长，宿主只在选中文言时才用）。
const DESC_MAX = 500
const skillIds = skillDirs
for (const lang of ['zh', 'en']) {
  let table
  try {
    table = JSON.parse(await readFile(join(skillDir, `descriptions.${lang}.json`), 'utf8'))
  } catch (err) {
    console.error(`[verify] descriptions.${lang}.json 读取失败：${err instanceof Error ? err.message : String(err)}`)
    ok = false
    continue
  }
  for (const id of skillIds) {
    const desc = table[id]
    if (typeof desc !== 'string' || desc.length === 0) {
      console.error(`[verify] descriptions.${lang}.json 缺少 ${id}`)
      ok = false
      continue
    }
    if (desc.length > DESC_MAX) {
      console.error(`[verify] ${id} (${lang}) description ${desc.length} chars > ${DESC_MAX} (模型目录会截断)`)
      ok = false
    }
  }
}
console.log(`[verify] ✓ 技能描述 zh/en 各 ${skillIds.length} 项且均在 ${DESC_MAX} 内`)

// SKILL.md frontmatter 必须保持上游英文原文：模型读到的指令正文不应被中文化，
// 而描述的两种语言由配置选择（见 skills/descriptions.*.json）。
for (const dir of skillDirs) {
  const p = join(skillDir, dir, 'SKILL.md')
  const rawNorm = (await readFile(p, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const end = rawNorm.indexOf('\n---\n')
  const fm = parse(rawNorm.slice(4, end))
  if (typeof fm?.description !== 'string' || fm.description.trim() === '') {
    console.error(`[verify] ${dir}: frontmatter description 缺失`)
    ok = false
    continue
  }
  const cjk = fm.description.match(/[\u4e00-\u9fa5]/)
  if (cjk) {
    console.error(`[verify] ${dir}: frontmatter description 含中文「${cjk[0]}」（上游真源为英文）`)
    ok = false
  }
}

// 技能卡是模型会真的读到的内容：退役的配置路径或链路数写在里面会主动误导模型去改不生效的文件
for (const dir of skillDirs) {
  const p = join(skillDir, dir, 'SKILL.md')
  const rawNorm = (await readFile(p, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const body = rawNorm.slice(rawNorm.indexOf('\n---\n') + 5)
  // 上游原文里的宿主落点对 DSH 全是错的（XDG/APPDATA 路径、Claude Code 的 /plugin 自动更新），
  // 因此这些表述在 DSH 侧同样要判失败：模型读到会带用户去改不存在的路径。
  const retired = body.match(
    /\$DSH_HOME\/ponytail\/config\.json|环境变量 > 配置文件|四级|~\/\.config\/ponytail|%APPDATA%\\ponytail|\/plugin marketplace update/,
  )
  if (retired) {
    console.error(`[verify] ${dir}: 技能正文含对 DSH 无效的表述「${retired[0]}」（模型会读到并据此误导用户）`)
    ok = false
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
  'lib/ponytail-skills.js',
  'lib/ponytail-state.js',
  'lib/client.js',
  'cordis.patch.yml',
  'package.json',
  'skills/ponytail/SKILL.md',
  'skills/ponytail-review/SKILL.md',
  'AGENTS.md',
  'skills/descriptions.zh.json',
  'skills/descriptions.en.json',
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
// 客户端 i18n 接入反向断言：面板文案必须经 ctx.locale 双语字典（C6），
// 产物构建脚本不得回退到硬编码中文文案（t( 调用之外无中文字符串字面量，字典 JSON 除外）。
const buildScript = await readFile(join(rootDir, 'scripts', 'build-client.mjs'), 'utf8')
if (!buildScript.includes('ctx.locale.register(NS') || !/exports\.inject = \[[^\]]*"configForms"/.test(buildScript)) {
  console.error('[verify] FAIL: 客户端必须接入 ctx.locale（register + bind）并注入 configForms')
  ok = false
}
if (!buildScript.includes('t("level." + source.level)')) {
  console.error('[verify] FAIL: 诊断链 label 必须经字典按 level 覆盖（英文界面不可显示中文 label）')
  ok = false
}
console.log('[verify] ✓ client i18n via ctx.locale (bilingual panel)')

// locale 键集反向断言（评审 Important #3 加固）：t() 的 fallback 会让缺失键静默显示 key 名，
// 只断言「构建脚本含 t(...) 表达式」可能恒真。改为扫描产物里所有 t("...") 调用键，
// 逐一断言 zh/en 两册字典均含该键；并扫描字典 JSON 键，断言产物内嵌字典与 locale/*.json 一致。
const clientArtifact2 = await readFile(join(rootDir, 'lib', 'client.js'), 'utf8')
// 只收集纯字面量 t("xxx.yyy")（排除 t("level." + source.level) 这类动态拼接与插槽 key）。
// 大小写都要纳入：旧正则 [a-z]+ 把 mode.lockedHint / toast.modeChanged / skills.enabledToast
// 这类含大写的键全漏在检查之外，缺键时界面会静默显示 key 名本身。
const tKeys = [...clientArtifact2.matchAll(/t\(\"([A-Za-z]+\.[A-Za-z]+)\"\)/g)].map((m) => m[1])
const localeFiles = ['locale/zh.json', 'locale/en.json']
const zhDict = JSON.parse(await readFile(join(rootDir, 'locale', 'zh.json'), 'utf8'))
const enDict = JSON.parse(await readFile(join(rootDir, 'locale', 'en.json'), 'utf8'))
const resolveKey = (dict, key) => dict[key]
const missingT = tKeys.filter((k) => typeof resolveKey(zhDict, k) !== 'string' || typeof resolveKey(enDict, k) !== 'string')
const zhKeys = Object.keys(zhDict).sort()
const enKeys = Object.keys(enDict).sort()
if (JSON.stringify(zhKeys) !== JSON.stringify(enKeys)) {
  console.error('[verify] FAIL: zh/en locale 键集不一致')
  ok = false
}
if (missingT.length > 0) {
  console.error('[verify] FAIL: t() 引用但 locale 字典缺失的键: ' + missingT.join(', '))
  ok = false
} else {
  console.log('[verify] ✓ 产物 t() 键 ' + tKeys.length + ' 个全部在 zh/en 字典中')
}


// 客户端产物不得残留宿侧 Node API（C4 回归断言）：lib/client.js 是浏览器 CJS factory，
// `import.meta` / `process.` 在 <script src> 上下文是 SyntaxError，会让整个 combo 加载失败
// （面板静默消失，0.6~0.9 教训同族）。此断言针对产物本身，而非本脚本源码。
const clientArtifact = await readFile(join(rootDir, 'lib', 'client.js'), 'utf8')
if (clientArtifact.includes('import.meta') || clientArtifact.includes('process.')) {
  console.error('[verify] FAIL: lib/client.js 含宿侧 Node API 残留（import.meta/process.），浏览器加载必崩')
  ok = false
} else {
  console.log('[verify] ✓ lib/client.js 无 Node API 残留（import.meta/process.）')
}


// 技能描述单一真源反向断言：描述只能来自 skills/descriptions.{lang}.json，
// 出现「懒人模式本体」等硬编码短摘要即失败（防漂移回潮）。
// 客户端构建脚本不得出现硬编码技能描述（描述经 remote 快照下发，按配置语言取）。
const clientBuildSrc = await readFile(join(rootDir, 'scripts', 'build-client.mjs'), 'utf8')
const clientDrift = clientBuildSrc.match(/懒人模式本体|过度设计评审|全仓过度设计审计|债务台账收割|收益看板：展示[^，。]*|速查卡：模式/)
if (clientDrift) {
  console.error(`[verify] FAIL: build-client.mjs 出现硬编码技能描述（必须由 remote 快照下发）：${clientDrift[0]}`)
  ok = false
}
console.log('[verify] ✓ skill description single-source (skills/descriptions.{lang}.json)')

// 官方配置组合的接线契约（替代已失效的 settings.register 断言）：
// @deepseek-ai/dsh-settings@0.2.0-rc.2 没有 register 方法（全文件 0 次 register）——命名空间由
// 「唯一 profile 条目 + 含 volatile 字段的 Config」自动产生（dsh-settings/lib/index.js:413-464，
// volatileForm(schema) === undefined 即跳过该条目）。因此这里断言的是让命名空间出现的三个前提。
const hostSrc = await readFile(join(rootDir, 'src', 'ponytail.ts'), 'utf8')
const settingsSrc = await readFile(join(rootDir, 'src', 'ponytail-settings.ts'), 'utf8')
const ponytailPatch = await readFile(resolve(rootDir, 'cordis.patch.yml'), 'utf8')
const remoteSrc = await readFile(join(rootDir, 'src', 'ponytail-remote.ts'), 'utf8')
const officialConfigChecks = [
  ['Config 含 volatile 的 defaultMode', /defaultMode: Schema\.union\(\[[^\]]*\]\)\.volatile\(\)/.test(hostSrc)],
  ['Config 含 volatile 的 disabledSkills', /disabledSkills: Schema\.array\(Schema\.string\(\)\)\.volatile\(\)/.test(hostSrc)],
  ['defaultMode 仍无 Schema 默认值（否则补丁的缺省与显式写入不可区分，诊断面板失去判别力）', !/defaultMode: Schema\.union\(\[[^\]]*\]\)\.default\(/.test(hostSrc)],
  ['cordis.patch.yml 声明条目 id: ponytail（命名空间即由此 id 产生）', /- id: ponytail\b/.test(ponytailPatch)],
  ['配置通道经 settings.mutate 写入（官方路径）', /mutate\(namespace, ops, revision\)/.test(settingsSrc)],
  ['patchMode 实时读取 volatile 引用（非启动快照）', /readVolatile\(resolved\.defaultMode\)/.test(hostSrc)],
  ['删除不存在的 settings.register 调用', !/settings\.register\(|service\.register\('ponytail'/.test(hostSrc)],
  ['远程服务命名空间为 ponytail（客户端挂成 ctx.remote.ponytail）', /super\(ctx, 'ponytailRemote', \{ namespace: 'ponytail' \}\)/.test(remoteSrc)],
  ['远程通道只暴露只读端点 snapshot', /@Remote\('snapshot'\)/.test(remoteSrc)],
  ['远程通道不含写端点（写操作归 settings）', !/@Remote\('(set|write|update|reset|toggle)'\)/.test(remoteSrc)],
  ['技能描述语言为带默认值的 volatile 字段（面板要区分显式 en 与未配）', /skillDescriptionLang: Schema\.union\(\['zh', 'en'\]\)\.default\('zh'\)\.volatile\(\)/.test(hostSrc)],
  ['技能元数据随远程通道提供（readSkillMeta 按语言下发）', /export function readSkillMeta\(lang\?: SkillLang\)/.test(remoteSrc)],
  ['远程快照携带技能描述语言与 6 项元数据', /skills: readSkillMeta\(skillLang\)/.test(hostSrc)],
  ['描述语言变更触发技能目录失效（否则模型侧读旧语言）', /touched\.has\('skillDescriptionLang'\)/.test(hostSrc)],
  ['src/ponytail-http.ts 已删除（不再有自制端点）', !existsSync(join(rootDir, 'src', 'ponytail-http.ts'))],
  ['宿主不再注入 webServer', !/webServer/.test(hostSrc)],
  ['宿主不注册 HTTP 路由', !/api\/plugins\/ponytail/.test(hostSrc)],
  ['客户端经 configForms.get 读取官方配置', /ctx\.configForms\.get\('ponytail'\)/.test(clientBuildSrc)],
  ['客户端经 whileServed 跟随命名空间', /configForms\.whileServed\(\s*\[\s*['"]ponytail['"]/.test(clientBuildSrc)],
  ['客户端注入 configForms 服务', /"configForms"/.test(clientBuildSrc)],
  ['客户端经 remote 读取只读推导值', /ctx\.remote\.ponytail/.test(clientBuildSrc)],
  ['客户端不再请求自制 HTTP 端点', !/\/api\/plugins\/ponytail/.test(clientBuildSrc)],
]
const failedOfficial = officialConfigChecks.filter(([, pass]) => !pass).map(([name]) => name)
if (failedOfficial.length > 0) {
  console.error('[verify] FAIL: 官方配置组合接线不完整：' + failedOfficial.join('、'))
  ok = false
} else {
  console.log('[verify] ✓ official plugin-config wiring (volatile Config + settings channel + profile entry)')
}

// 检查 cordis.patch.yml 引用包名而非绝对路径
const patch = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.patch.yml'), 'utf8')
if (patch.includes('dsh-ponytail') && !patch.includes('/absolute')) console.log('[verify] ✓ cordis.patch.yml uses package name')
else { console.error('[verify] cordis.patch.yml not referencing dsh-ponytail by package name'); ok = false }

// 跨平台路径门禁（见 docs/adr/0005）：
// 存储路径必须由 DSH 数据根解析得出，不得出现平台判断或平台特定路径字面量。
// 1A 下沉后已无豁免：旧平台位置（APPDATA / XDG_CONFIG_HOME / ~/.config）的兼容读取
// 随 getLegacyConfigDir 一并删除，src/ 下任何位置出现平台约定即判失败。
// 已移除：1A 迁移后 src/ 下无平台位置兼容分支
const platformPathPattern = /%APPDATA%|XDG_CONFIG_HOME|process\.platform|\.config[\\/]ponytail|AppData[\\/]Roaming/
const offenders = []
for (const f of (await readdir(srcDir)).filter(f => f.endsWith('.ts'))) {
  const code = await readFile(join(srcDir, f), 'utf8')
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
