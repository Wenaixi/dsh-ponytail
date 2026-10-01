import { before, after, test } from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { createPonytailState } from '../lib/ponytail-state.js'
import { setMode, readMode, clearMode } from '../lib/ponytail-runtime.js'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePonytailCommand, createCommandDispatcher, extractTextFromContent, extractText } from '../lib/ponytail-commands.js'
import { render } from '../lib/ponytail-instructions.js'
import { apply } from '../lib/ponytail.js'

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

// 全局隔离 DSH 配置目录：所有触碰 flag 的测试在临时 XDG_CONFIG_HOME 下运行，
// 不读写真实配置（%APPDATA%\ponytail 或 ~/.config/ponytail）
const { mkdtemp, rm, readFile: readFileFsp } = await import('node:fs/promises')
const prevXdg = process.env.XDG_CONFIG_HOME
const prevAppData = process.env.APPDATA
const tmpXdg = await mkdtemp(join(os.tmpdir(), 'ponytail-test-'))
before(() => {
  process.env.XDG_CONFIG_HOME = tmpXdg
  delete process.env.APPDATA
})
after(async () => {
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = prevXdg
  if (prevAppData === undefined) delete process.env.APPDATA
  else process.env.APPDATA = prevAppData
  await rm(tmpXdg, { recursive: true, force: true })
})

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

// A4：list()/get() 依赖真实 fs 与 ctx，直接实例化会写 DSH 配置目录 flag 文件，
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

test('createPonytailState: set("off") 归一为 null（关闭态单一表示）', () => {
  const state = createPonytailState()
  state.set("off")
  assert.equal(state.get(), null)
})

test('createPonytailState: set(null) 保持 null', () => {
  const state = createPonytailState()
  state.set('full')
  state.set(null)
  assert.equal(state.get(), null)
})

test('createPonytailState: 文件缺省时 syncFromFile 清空内存（DSH 单一宿主，flag 缺失即关闭）', async () => {
  const state = createPonytailState()
  state.set('full') // set 会写 flag（自动落盘），先删除 flag 制造「文件缺失」场景
  clearMode()
  state.syncFromFile()
  assert.equal(state.get(), null, 'DSH 单一宿主：flag 缺失即关闭（内存清空）')
})

test('render: lite 渲染不含 ultra/full 示例行（示例行裁剪契约）', () => {
  const out = render(skillDir, 'lite')
  assert.ok(out.includes('- lite：「'), 'lite 渲染应包含 lite 示例行')
  assert.ok(!out.includes('- full：「'), 'lite 渲染不应包含 full 示例行')
  assert.ok(!out.includes('- ultra：「'), 'lite 渲染不应包含 ultra 示例行')
})

test('list: 无 SKILL.md 的目录被跳过且不抛错（stat 删除后的失败面收敛）', async () => {
  const fsp = await import('node:fs/promises')
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ponytail-list-'))
  await fsp.mkdir(path.join(tmp, 'empty-dir'))
  await fsp.mkdir(path.join(tmp, 'good-skill'))
  await fsp.writeFile(path.join(tmp, 'good-skill', 'SKILL.md'),
    '---\nname: good-skill\ndescription: desc\n---\n# Good\n')
  const ctx = {
    on: () => {}, effect: () => {}, logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
  }
  const { PonytailProvider } = await import('../lib/ponytail-skills.js')
  const p = new PonytailProvider(ctx, {}, { skillDir: tmp })
  const res = await p.list({})
  const names = res.map((c) => c.name)
  assert.deepEqual(names, ['good-skill'], '空目录被跳过，good-skill 被枚举')
  await fsp.rm(tmp, { recursive: true, force: true })
})
test('createCommandDispatcher: /ponytail default lite 触发注入的 writeDefaultMode 且同步 state.set', () => {
  let mockWritten = null
  let logOutput = ''
  let stateVal = 'full'
  const state = {
    get: () => stateVal,
    set: (m) => { stateVal = m },
    syncFromFile: () => {}
  }
  const logger = {
    info: (msg) => { logOutput += msg + '\n' },
    warn: (msg) => { logOutput += msg + '\n' },
    debug: () => {}
  }
  const dispatcher = createCommandDispatcher({
    state,
    logger,
    getDefaultMode: () => 'full',
    writeDefaultMode: (mode) => {
      mockWritten = mode
      return mode
    }
  })

  const res = dispatcher.dispatchText('/ponytail default lite')
  assert.equal(res.handled, true)
  assert.equal(mockWritten, 'lite')
  assert.equal(stateVal, 'lite')
  assert.match(logOutput, /默认等级已持久化：lite/)
})

test('createCommandDispatcher: /ponytail default foobar 非法参数不触发 writeDefaultMode 且不修改 state', () => {
  let writeCalled = false
  let logOutput = ''
  let stateVal = 'full'
  const state = {
    get: () => stateVal,
    set: (m) => { stateVal = m },
    syncFromFile: () => {}
  }
  const logger = {
    info: (msg) => { logOutput += msg + '\n' },
    warn: (msg) => { logOutput += msg + '\n' },
    debug: () => {}
  }
  const dispatcher = createCommandDispatcher({
    state,
    logger,
    getDefaultMode: () => 'full',
    writeDefaultMode: (mode) => {
      writeCalled = true
      return null
    }
  })

  const res = dispatcher.dispatchText('/ponytail default foobar')
  assert.equal(res.handled, true)
  assert.equal(writeCalled, false)
  assert.equal(stateVal, 'full')
  assert.equal(logOutput, '')
})
test('createPonytailState: syncToFile 显式落盘当前内存状态', () => {
  const state = createPonytailState()
  state.set('lite')
  assert.equal(state.get(), 'lite')
  // 显式触发 syncToFile 不改变内存态且不抛错
  assert.doesNotThrow(() => state.syncToFile())
  assert.equal(state.get(), 'lite')
})

test('ponytail-runtime: setMode 落盘至 DSH 配置目录且 readMode 往返', async () => {
  // before 钩子已把 XDG_CONFIG_HOME 指向临时目录，直接验证 DSH 配置目录落盘
  const cfgDir = process.env.XDG_CONFIG_HOME
  setMode('ultra')
  assert.equal(readMode(), 'ultra', 'setMode 后 readMode 应返回 ultra')
  const flagPath = join(cfgDir, 'ponytail', '.ponytail-active')
  const exists = await import('node:fs/promises').then(fs => fs.stat(flagPath).then(() => true).catch(() => false))
  assert.equal(exists, true, 'flag 文件应物理位于 DSH 配置目录（XDG_CONFIG_HOME/ponytail/.ponytail-active）')
  assert.equal(await readFileFsp(flagPath, 'utf8'), 'ultra')
  clearMode()
  assert.equal(readMode(), null, 'clearMode 后 readMode 应为 null')
})
