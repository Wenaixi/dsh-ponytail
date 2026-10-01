import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePonytailCommand, createCommandDispatcher, extractTextFromContent, extractText } from '../lib/ponytail-commands.js'
import { render } from '../lib/ponytail-instructions.js'
import { apply } from '../lib/ponytail.js'

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

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

test('parsePonytailCommand: /ponytail foobar 按上游 else 兜底切到默认等级', () => {
  // 上游 mode-tracker 4.10.0：未知参数 `else { mode = getDefaultMode(); }` 静默切默认
  // DSH 移植逐分支对齐（4.10.0-dsh.0 深度对照确认），非未知参数报错
  const r = parsePonytailCommand('/ponytail foobar', null, getDefault)
  assert.deepEqual(r, { handled: true, switched: true, mode: 'full' })
})

test('parsePonytailCommand: /ponytail default lite 持久化默认', () => {
  const r = parsePonytailCommand('/ponytail default lite', null, getDefault)
  assert.deepEqual(r, { handled: true, switched: false, persistDefault: { mode: 'lite' } })
})

test('parsePonytailCommand: /ponytail default foobar 不切换（非法默认由 writeDefaultMode 拒绝）', () => {
  const r = parsePonytailCommand('/ponytail default foobar', null, getDefault)
  assert.deepEqual(r, { handled: true, switched: false, persistDefault: { mode: 'foobar' } })
})

test('render: lite 保留 lite 行、剔除 full/ultra 行与正文 frontmatter', () => {
  const out = render(skillDir, 'lite')
  assert.ok(out.startsWith('PONYTAIL 已激活 — 等级：lite'), '应带等级头')
  assert.ok(!out.startsWith('---'), 'frontmatter 应被剥离')
  assert.ok(out.includes('| **lite** |'))
  assert.ok(!out.includes('| **full** |'))
  assert.ok(!out.includes('| **ultra** |'))
})

test('render: review 返回指针文本，不读取 SKILL.md', () => {
  const out = render(skillDir, 'review')
  assert.deepEqual(out, 'PONYTAIL 已激活 — 等级：review，行为由 /ponytail-review 技能定义。')
})

test('render: 无效 skillDir 回退 fallback 指令而非抛错', () => {
  const out = render(join(skillDir, '__missing__'), 'full')
  assert.ok(out.includes('PONYTAIL 已激活 — 等级：full'))
  assert.ok(out.includes('## 梯子'))
})

// A4：list()/get() 依赖真实 fs 与 ctx，直接实例化会写 ~/.claude flag 文件，
// 因此用 apply() 注册 provider（factory 经 ctx.skills 校验）后取 provider 实例，
// 传已 abort 的 signal 断言首行 throwIfAborted 立即抛 AbortError。
test('list/get: 传入已 abort 的 AbortSignal 立即抛 AbortError（settle promptly）', async () => {
  const ctx = {
    on: () => {},
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: {
      registerProvider: (factory) => {
        provider = factory({})
        return () => {}
      },
    },
    systemPrompt: { section: () => () => {} },
  }
  let provider
  apply(ctx)
  assert.ok(provider, 'provider 应已注册')
  const ac = new AbortController()
  ac.abort()
  await assert.rejects(provider.list({ signal: ac.signal }), (err) => err.name === 'AbortError')
  const fakeCandidate = { locator: { path: 'nope', directory: 'nope' } }
  await assert.rejects(provider.get(fakeCandidate, { signal: ac.signal }), (err) => err.name === 'AbortError')
})

// ==========================================
// CommandDispatcher & Text Extraction Tests
// ==========================================

test('extractTextFromContent: 字符串与多 block 数组正常提取并过滤非文本', () => {
  assert.equal(extractTextFromContent('hello'), 'hello')
  assert.equal(extractTextFromContent(null), '')
  assert.equal(extractTextFromContent(123), '')
  const blocks = [
    { type: 'image', data: 'xyz' },
    { type: 'text', text: 'first line' },
    { type: 'text', text: 'second line' },
    { foo: 'bar' }
  ]
  assert.equal(extractTextFromContent(blocks), 'first line\nsecond line')
})

test('extractText: 过滤空 content 并合并多 message', () => {
  const msgs = [
    { content: 'msg 1' },
    { content: [{ type: 'text', text: 'msg 2' }] },
    { content: null }
  ]
  assert.equal(extractText(msgs), 'msg 1\nmsg 2')
})

test('createCommandDispatcher: /ponytail lite 触发 state.set 并输出切换日志', () => {
  let currentState = null
  const logs = []
  const dispatcher = createCommandDispatcher({
    state: {
      get: () => currentState,
      set: (m) => { currentState = m },
      syncFromFile: () => {}
    },
    logger: {
      info: (msg) => logs.push(msg)
    },
    getDefaultMode: () => 'full'
  })

  const res = dispatcher.dispatchText('/ponytail lite')
  assert.deepEqual(res, { handled: true, switched: true })
  assert.equal(currentState, 'lite')
  assert.ok(logs.some(l => l.includes('已切换 — 等级：lite')))
})

test('createCommandDispatcher: stop ponytail. 触发 state.set(null) 失活并输出退出日志', () => {
  let currentState = 'full'
  const logs = []
  const dispatcher = createCommandDispatcher({
    state: {
      get: () => currentState,
      set: (m) => { currentState = m },
      syncFromFile: () => {}
    },
    logger: {
      info: (msg) => logs.push(msg)
    }
  })

  const res = dispatcher.dispatchText('stop ponytail.')
  assert.deepEqual(res, { handled: true, switched: true })
  assert.equal(currentState, null)
  assert.ok(logs.some(l => l.includes('已通过指令退出')))
})

test('createCommandDispatcher: 裸 /ponytail 仅报告当前等级，绝对不触发 state.set（防时序误切）', () => {
  let currentState = 'ultra'
  let setCalled = false
  const logs = []
  const dispatcher = createCommandDispatcher({
    state: {
      get: () => currentState,
      set: () => { setCalled = true },
      syncFromFile: () => {}
    },
    logger: {
      info: (msg) => logs.push(msg)
    },
    getDefaultMode: () => 'full'
  })

  const res = dispatcher.dispatchText('/ponytail')
  assert.deepEqual(res, { handled: true, switched: false })
  assert.equal(setCalled, false, '裸指令绝不可触发 set')
  assert.equal(currentState, 'ultra')
  assert.ok(logs.some(l => l.includes('当前等级：ultra')))
})

test('createCommandDispatcher: dispatchMessages 识别嵌套 block 中的指令并切换', () => {
  let currentState = null
  const dispatcher = createCommandDispatcher({
    state: {
      get: () => currentState,
      set: (m) => { currentState = m },
      syncFromFile: () => {}
    },
    logger: { info: () => {} }
  })

  const messages = [
    { content: [{ type: 'text', text: '/ponytail:ponytail-review' }] }
  ]
  const res = dispatcher.dispatchMessages(messages)
  assert.deepEqual(res, { handled: true, switched: true })
  assert.equal(currentState, 'review')
})
