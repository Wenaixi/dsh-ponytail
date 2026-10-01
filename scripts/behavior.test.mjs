import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePonytailCommand } from '../lib/ponytail-commands.js'
import { filterSkillBodyForMode } from '../lib/ponytail-instructions.js'

const getDefault = () => 'full'

test('parsePonytailCommand: /ponytail lite 切换 lite', () => {
  const r = parsePonytailCommand('/ponytail lite', null, getDefault)
  assert.deepEqual(r, { handled: true, switched: true, mode: 'lite' })
})

test('parsePonytailCommand: @ponytail ultra 归一为 / 并切换 ultra', () => {
  const r = parsePonytailCommand('@ponytail ultra', null, getDefault)
  assert.deepEqual(r, { handled: true, switched: true, mode: 'ultra' })
})

test('parsePonytailCommand: /ponytail:ponytail-review 切换 review', () => {
  const r = parsePonytailCommand('/ponytail:ponytail-review', null, getDefault)
  assert.deepEqual(r, { handled: true, switched: true, mode: 'review' })
})

test('parsePonytailCommand: 裸 /ponytail 仅报告不切换', () => {
  const r = parsePonytailCommand('/ponytail', null, getDefault)
  assert.deepEqual(r, { handled: true, switched: false, reportOnly: true, mode: 'full' })
})

test('parsePonytailCommand: stop ponytail. 全句失活（尾部标点）', () => {
  const r = parsePonytailCommand('stop ponytail.', 'lite', getDefault)
  assert.deepEqual(r, { handled: true, switched: true, deactivate: true })
})

test('parsePonytailCommand: /ponytail foobar 未知参数不切换', () => {
  const r = parsePonytailCommand('/ponytail foobar', null, getDefault)
  assert.deepEqual(r, { handled: true, switched: false, unknownArg: 'foobar' })
})

test('filterSkillBodyForMode: lite 保留 lite 行、剔除 full 行', () => {
  const body = [
    '## 强度',
    '',
    '| 等级 | 变化 |',
    '|-------|------|',
    '| **lite** | 按要求构建，顺带点出更懒的替代方案。 |',
    '| **full** | 强制走梯子，标准库和原生优先。 |',
    '| **ultra** | YAGNI 极端派，先删后加。 |',
    '',
    '- lite: "在同一行点出更懒的方案"',
    '- full: "最短 diff 获胜"',
  ].join('\n')
  const out = filterSkillBodyForMode(body, 'lite')
  assert.ok(out.includes('| **lite** |'))
  assert.ok(!out.includes('| **full** |'))
  assert.ok(!out.includes('| **ultra** |'))
  assert.ok(out.includes('- lite: "在同一行点出更懒的方案"'))
  assert.ok(!out.includes('- full: "最短 diff 获胜"'))
})

test('filterSkillBodyForMode: review 模式标准化回退 full（review 独立文本由 plugin 层提供）', () => {
  // normalizeMode 不识别 review，effectiveMode 回退 full；review 的真正独立文本在
  // ponytail.ts 的 section 中（currentMode==='review' 时不调用本函数）
  const body = '## 强度\n\n| **lite** | a |\n| **full** | b |\n'
  const out = filterSkillBodyForMode(body, 'review')
  assert.ok(!out.includes('**lite**'))
  assert.ok(out.includes('**full**'))
})