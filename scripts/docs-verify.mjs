import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const read = (file) => readFile(resolve(root, file), 'utf8')
const failures = []

// 门禁只校验版本四处一致，不写死具体版本号：每次发版改这里就会漏改一处
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) failures.push('package.json.version 必须是本地标准 SemVer')
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pkg.version)) failures.push('package.json.version 必须是本地标准 SemVer')

const readme = await read('README.md')
for (const text of [pkg.version, '4.10.3', '独立维护', 'https://github.com/DietrichGebert/ponytail']) {
  if (!readme.includes(text)) failures.push('README 缺少：' + text)
}
if (readme.includes('bump:dsh')) failures.push('README 仍包含已废弃的 bump:dsh')

const changelog = await read('CHANGELOG.md')
if (!changelog.includes('## [' + pkg.version + ']')) failures.push('CHANGELOG 缺少 ' + pkg.version + ' 段')

const publish = await read('.github/workflows/publish.yml')
if (publish.includes('Behavior tests (61 cases)')) failures.push('publish workflow 写死旧测试数量')
if (!publish.includes('Upstream reference: DietrichGebert/ponytail 4.10.3')) failures.push('publish workflow 缺少上游参考版本')

const adr = await read('docs/adr/0008-independent-local-versioning.md')
for (const text of ['5.0.0', '4.10.3', '独立', '不再由版本脚本生成']) {  // ADR-0008 是历史决策快照，版本号不随之更新
  if (!adr.includes(text)) failures.push('ADR-0008 缺少：' + text)
}

if (failures.length) {
  console.error('[docs-verify] FAIL')
  for (const failure of failures) console.error('- ' + failure)
  process.exit(1)
}
console.log('[docs-verify] PASS: 本地版本、上游参考和发布文档一致')
