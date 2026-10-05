import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const read = (file) => readFile(resolve(root, file), 'utf8')
const failures = []

// 本地版本号只由 package.json 决定，门禁只校验它的形状，不在文档里比对具体版本号（ADR-0010）
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) failures.push('package.json.version 必须是本地标准 SemVer')

// README 不承载版本对照（ADR-0010）：版本号散落在多处必然漂移，npm 页面也不需要核验日期。
// 这里只锁两件事：README 仍说出「独立维护」这一定性策略，且仍指向上游仓库。
const readme = await read('README.md')
for (const text of ['独立维护', 'https://github.com/DietrichGebert/ponytail']) {
  if (!readme.includes(text)) failures.push('README 缺少：' + text)
}
if (readme.includes('bump:dsh')) failures.push('README 仍包含已废弃的 bump:dsh')

const changelog = await read('CHANGELOG.md')
if (!changelog.includes('## [' + pkg.version + ']')) failures.push('CHANGELOG 缺少 ' + pkg.version + ' 段')

const publish = await read('.github/workflows/publish.yml')
if (publish.includes('Behavior tests (61 cases)')) failures.push('publish workflow 写死旧测试数量')

const adr = await read('docs/adr/0008-independent-local-versioning.md')
for (const text of ['5.0.0', '4.10.3', '独立', '不再由版本脚本生成']) {  // ADR-0008 是历史决策快照，版本号不随之更新
  if (!adr.includes(text)) failures.push('ADR-0008 缺少：' + text)
}

// 版本对照的真源落点是项目记忆库（ADR-0010）。它被 .gitignore 排除，缺失时不判失败；
// 存在时必须写全「上游参考」与「独立演进」，否则维护者失去版本对照。
const memory = await read('CLAUDE.md').catch(() => null)
if (memory !== null) {
  for (const text of ['上游参考', '独立演进', '4.10.3']) {
    if (!memory.includes(text)) failures.push('CLAUDE.md 缺少版本对照项：' + text)
  }
}

if (failures.length) {
  console.error('[docs-verify] FAIL')
  for (const failure of failures) console.error('- ' + failure)
  process.exit(1)
}
console.log('[docs-verify] PASS: 版本策略文档一致')
