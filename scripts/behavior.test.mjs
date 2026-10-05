import { before, after, test } from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { createPonytailState } from '../lib/ponytail-state.js'
import { setMode, readMode, clearMode } from '../lib/ponytail-state.js'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePonytailCommand, createCommandDispatcher, extractTextFromContent, extractText } from '../lib/ponytail-commands.js'
import { render, renderPromptSection } from '../lib/ponytail-instructions.js'
import { apply, Config as ConfigSchema } from '../lib/ponytail.js'
import {
  resolveDshHome,
  getConfigDir,
  getConfigPath,
  getLegacyConfigPath,
  readConfigFileText,
} from '../lib/ponytail-config.js'

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

// 全局隔离 DSH 配置目录：所有触碰 flag 的测试在临时 DSH_HOME 下运行，
// 不读写真实配置（~/.dsh/ponytail 或旧位置）
const { mkdtemp, rm, readFile: readFileFsp, writeFile: writeFileFsp, mkdir } = await import('node:fs/promises')
const prevDsh = process.env.DSH_HOME
const prevXdg = process.env.XDG_CONFIG_HOME
const prevAppData = process.env.APPDATA
const tmpDsh = await mkdtemp(join(os.tmpdir(), 'ponytail-test-'))
before(() => {
  process.env.DSH_HOME = tmpDsh
  delete process.env.XDG_CONFIG_HOME
  delete process.env.APPDATA
})
after(async () => {
  if (prevDsh === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevDsh
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = prevXdg
  if (prevAppData === undefined) delete process.env.APPDATA
  else process.env.APPDATA = prevAppData
  await rm(tmpDsh, { recursive: true, force: true })
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

// Config schema 回归：defaultMode 不得带 Schema 默认值——Cordis 校验会把缺省 fill 成显式配置，
// 从而 shadow 掉 config.json 的 defaultMode 档（上游 env > config 文件 > full 语义）；
// 4.10.0-dsh.3 修复前 .default('full') 导致 config.json 默认档永远不可达。
test('Config schema: defaultMode 无 Schema 默认值（config.json 默认档可达）', async () => {
  const { readVolatile } = await import('../lib/ponytail-config.js')
  const cfg = ConfigSchema({})
  assert.equal(readVolatile(cfg.defaultMode), undefined, 'defaultMode 读到 undefined（未配置时让位 resolvePriority）')
  assert.equal(cfg.defaultMode.get(), undefined, 'volatile 引用的初值也是 undefined——这才是「无 Schema 默认值」的可观察形式')
  assert.equal(cfg.providerName, 'ponytail', 'providerName 默认值保留')
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
  // before 钩子已把 DSH_HOME 指向临时目录，直接验证 DSH 数据目录落盘
  const dshHome = process.env.DSH_HOME
  setMode('ultra')
  assert.equal(readMode(), 'ultra', 'setMode 后 readMode 应返回 ultra')
  const flagPath = join(dshHome, 'ponytail', '.ponytail-active')
  const exists = await import('node:fs/promises').then(fs => fs.stat(flagPath).then(() => true).catch(() => false))
  assert.equal(exists, true, 'flag 文件应物理位于 DSH 数据目录（DSH_HOME/ponytail/.ponytail-active）')
  assert.equal(await readFileFsp(flagPath, 'utf8'), 'ultra')
  clearMode()
  assert.equal(readMode(), null, 'clearMode 后 readMode 应为 null')
})

test('createPonytailState: 传入自定义内存存储适配器隔离运行，无需触碰磁盘', () => {
  let storageVal = null
  let writeCount = 0
  let clearCount = 0
  const mockStorage = {
    read: () => storageVal,
    write: (mode) => {
      writeCount++
      storageVal = mode
    },
    clear: () => {
      clearCount++
      storageVal = null
    }
  }

  const state = createPonytailState({ storage: mockStorage })
  assert.equal(state.get(), null)

  // 1. set 写入内存并同步至 mockStorage
  state.set('ultra')
  assert.equal(state.get(), 'ultra')
  assert.equal(storageVal, 'ultra')
  assert.equal(writeCount, 1)

  // 2. set('off') 归一为 null 并触发 clear
  state.set('off')
  assert.equal(state.get(), null)
  assert.equal(storageVal, null)
  assert.equal(clearCount, 1)

  // 3. 外部介质变更，syncFromFile 同步纠偏
  storageVal = 'lite'
  state.syncFromFile()
  assert.equal(state.get(), 'lite')

  // 4. syncToFile 显式落盘
  state.syncToFile()
  assert.equal(storageVal, 'lite')
})

test('renderPromptSection: 封装状态同步、关闭态守卫与动态模板渲染全链路', () => {
  let mockVal = null
  const mockStorage = {
    read: () => mockVal,
    write: (m) => { mockVal = m },
    clear: () => { mockVal = null }
  }
  const state = createPonytailState({ storage: mockStorage })

  // 1. 默认关闭态（null）返回空字符串
  assert.equal(renderPromptSection(skillDir, state), '')

  // 2. 显式设为 off 返回空字符串
  state.set('off')
  assert.equal(renderPromptSection(skillDir, state), '')

  // 3. 激活为 lite 返回裁剪后的提示词
  state.set('lite')
  const litePrompt = renderPromptSection(skillDir, state)
  assert.match(litePrompt, /PONYTAIL 已激活 — 等级：lite/)
  assert.doesNotMatch(litePrompt, /\*\*ultra\*\*/)

  // 4. 外部存储变更为 ultra，renderPromptSection 自动触发 syncFromFile 纠偏
  mockVal = 'ultra'
  const ultraPrompt = renderPromptSection(skillDir, state)
  assert.match(ultraPrompt, /PONYTAIL 已激活 — 等级：ultra/)
  assert.equal(state.get(), 'ultra')
})


test('readFullConfig / writeFullConfig / resetFullConfig: 正确读写配置与一键重置', async () => {
  const { readFullConfig, writeFullConfig, resetFullConfig } = await import('../lib/ponytail-config.js')
  // 备份原配置
  const original = readFullConfig()
  try {
    const written = writeFullConfig({ defaultMode: 'lite', disabledSkills: ['ponytail-gain'] })
    assert.strictEqual(written?.defaultMode, 'lite')
    assert.deepStrictEqual(written?.disabledSkills, ['ponytail-gain'])

    const read = readFullConfig()
    assert.strictEqual(read.defaultMode, 'lite')
    assert.deepStrictEqual(read.disabledSkills, ['ponytail-gain'])

    const reset = resetFullConfig()
    assert.strictEqual(reset?.defaultMode, 'full')
    assert.deepStrictEqual(reset?.disabledSkills, [])
  } finally {
    // 还原
    writeFullConfig(original)
  }
})


test('C1 状态: 外部改 config.json disabledSkills 后 reloadDisabledSkills 收敛内存', async () => {
  const { createPonytailState, isMainSkillDisabled } = await import('../lib/ponytail-state.js')
  const { writeFullConfig, readFullConfig } = await import('../lib/ponytail-config.js')
  const orig = readFullConfig()
  const state = createPonytailState({ storage: { read: () => null, write: () => {}, clear: () => {} } })
  assert.strictEqual(state.isSkillEnabled('ponytail-gain'), true)
  // 模拟外部手改 config.json（不经 state 写方法）
  writeFullConfig({ disabledSkills: ['ponytail-gain'] })
  assert.strictEqual(state.isSkillEnabled('ponytail-gain'), true, '写盘前内存态不变（现状）')
  state.reloadDisabledSkills()
  assert.strictEqual(state.isSkillEnabled('ponytail-gain'), false, 'reload 后内存态收敛到文件')
  // 纯函数真值表
  assert.strictEqual(isMainSkillDisabled(['ponytail']), true)
  assert.strictEqual(isMainSkillDisabled(['ponytail-gain']), false)
  assert.strictEqual(isMainSkillDisabled([]), false)
  // 还原
  writeFullConfig(orig)
})

test('createPonytailState: Skill 独立开关、默认等级设置与一键恢复默认流转', async () => {
  const { createPonytailState } = await import('../lib/ponytail-state.js')
  let memFlag = null
  const memStorage = {
    read: () => memFlag,
    write: (m) => { memFlag = m },
    clear: () => { memFlag = null },
  }
  const state = createPonytailState({ storage: memStorage })

  // 默认启用
  assert.strictEqual(state.isSkillEnabled('ponytail-review'), true)

  // 禁用 ponytail-review
  const newState = state.toggleSkill('ponytail-review', false)
  assert.strictEqual(newState, false)
  assert.strictEqual(state.isSkillEnabled('ponytail-review'), false)
  assert.ok(state.getDisabledSkills().includes('ponytail-review'))

  // 再次开启
  state.toggleSkill('ponytail-review', true)
  assert.strictEqual(state.isSkillEnabled('ponytail-review'), true)

  // setDefaultMode 与 resetToDefaults
  state.setDefaultMode('ultra')
  state.resetToDefaults()
  assert.strictEqual(state.get(), 'full')
  assert.deepStrictEqual(state.getDisabledSkills(), [])
})

test('PonytailProvider: list() 与 get() 严格过滤禁用技能（3A 物理隐藏契约）', async () => {
  const { PonytailProvider } = await import('../lib/ponytail-skills.js')
  const { dirname, resolve } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

  let invalidated = false
  const fakeControl = {
    signal: new AbortController().signal,
    invalidate: () => { invalidated = true },
  }
  const fakeCtx = { logger: { warn: () => {}, debug: () => {} } }

  // 禁用 ponytail-review 和 ponytail-gain
  const disabled = new Set(['ponytail-review', 'ponytail-gain'])
  const provider = new PonytailProvider(fakeCtx, fakeControl, {
    providerName: 'ponytail',
    skillDir,
    isSkillEnabled: (name) => !disabled.has(name),
  })

  const candidates = await provider.list({})
  assert.ok(Array.isArray(candidates))
  const names = candidates.map(c => c.name)
  // 6 个技能中，禁用的 2 个绝对不出现在列表中
  assert.strictEqual(names.includes('ponytail-review'), false)
  assert.strictEqual(names.includes('ponytail-gain'), false)
  assert.strictEqual(names.includes('ponytail'), true)
  assert.strictEqual(names.includes('ponytail-audit'), true)

  // get() 试图直接获取被禁用的技能，直接返回 undefined
  const disabledCandidate = { name: 'ponytail-review', path: resolve(skillDir, 'ponytail-review', 'SKILL.md'), locator: {} }
  const gotDisabled = await provider.get(disabledCandidate, {})
  assert.strictEqual(gotDisabled, undefined)

  // get() 获取未禁用的技能正常返回
  const enabledCandidate = { name: 'ponytail', path: resolve(skillDir, 'ponytail', 'SKILL.md'), locator: {} }
  const gotEnabled = await provider.get(enabledCandidate, {})
  assert.ok(gotEnabled !== undefined)
  assert.strictEqual(gotEnabled.name, 'ponytail')

  // invalidate 通知
  provider.invalidate()
  assert.strictEqual(invalidated, true)
})

test('resolveDshHome: 优先级与路径展开（explicit > DSH_HOME > ~/.dsh）', () => {
  // 1. 显式参数最高优先级
  const explicit = resolveDshHome('/custom/configured/home')
  assert.equal(explicit, path.resolve('/custom/configured/home'))

  // 2. DSH_HOME 环境变量覆盖
  const envHome = resolveDshHome(undefined, { DSH_HOME: '/env/dsh/home' })
  assert.equal(envHome, path.resolve('/env/dsh/home'))

  // 3. 空白 DSH_HOME 回退默认 ~/.dsh
  const blankHome = resolveDshHome(undefined, { DSH_HOME: '   ' })
  assert.equal(blankHome, path.resolve(join(os.homedir(), '.dsh')))

  // 4. ~ 前缀展开为家目录
  const tildeHome = resolveDshHome(undefined, { DSH_HOME: '~/my-dsh-root' })
  assert.equal(tildeHome, path.resolve(join(os.homedir(), 'my-dsh-root')))
})

test('getConfigDir & getConfigPath: 均准确落于 DSH 数据目录下的 ponytail 子目录', () => {
  const currentDsh = process.env.DSH_HOME
  assert.ok(currentDsh, 'DSH_HOME 应已由测试 hook 隔离设置')
  assert.equal(getConfigDir(), join(currentDsh, 'ponytail'))
  assert.equal(getConfigPath(), join(currentDsh, 'ponytail', 'config.json'))
})

test('readConfigFileText: 新配置缺失时平滑回退读取旧平台路径', async () => {
  const legacyDir = await mkdtemp(join(os.tmpdir(), 'ponytail-legacy-cfg-'))
  const legacySubdir = join(legacyDir, 'ponytail')
  await mkdir(legacySubdir, { recursive: true })
  const legacyFile = join(legacySubdir, 'config.json')
  await writeFileFsp(legacyFile, JSON.stringify({ defaultMode: 'lite', disabledSkills: ['ponytail-gain'] }), 'utf8')

  const originalXdg = process.env.XDG_CONFIG_HOME
  const originalDsh = process.env.DSH_HOME
  const freshDsh = await mkdtemp(join(os.tmpdir(), 'ponytail-fresh-dsh-'))
  try {
    process.env.XDG_CONFIG_HOME = legacyDir
    process.env.DSH_HOME = freshDsh // 新 DSH_HOME 下尚未生成 config.json

    const legacyText = readConfigFileText()
    assert.ok(legacyText !== null, '新位置缺失时应成功从旧路径回退读取')
    const parsed = JSON.parse(legacyText)
    assert.equal(parsed.defaultMode, 'lite')
    assert.deepEqual(parsed.disabledSkills, ['ponytail-gain'])
  } finally {
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = originalXdg
    process.env.DSH_HOME = originalDsh
    await rm(legacyDir, { recursive: true, force: true })
    await rm(freshDsh, { recursive: true, force: true })
  }
})


// ---------------------------------------------------------------------------
// 运行等级优先级诊断（纯函数，零 I/O）
// ---------------------------------------------------------------------------

test('resolvePriority: 四级全空时落到内置兜底 full', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: undefined, patchMode: undefined, configMode: undefined })
  assert.strictEqual(r.chain.length, 4)
  assert.strictEqual(r.effective, 'full')
  assert.strictEqual(r.chain[3].level, 'fallback')
  assert.strictEqual(r.chain[3].hit, true)
  assert.ok(r.chain.slice(0, 3).every(s => s.hit === false))
  assert.ok(r.chain.slice(0, 3).every(s => s.shadowed === false))
})

test('resolvePriority: env 命中时其余三级全部标记被覆盖', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: 'ultra', patchMode: 'lite', configMode: 'lite' })
  assert.strictEqual(r.effective, 'ultra')
  assert.strictEqual(r.chain[0].level, 'env')
  assert.strictEqual(r.chain[0].hit, true)
  assert.strictEqual(r.chain[0].shadowed, false)
  assert.ok(r.chain.slice(1).every(s => s.shadowed === true))
  assert.ok(r.chain.slice(1).every(s => s.hit === false))
})

test('resolvePriority: patch 命中时压制 config 与 fallback', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: undefined, patchMode: 'lite', configMode: 'ultra' })
  assert.strictEqual(r.effective, 'lite')
  assert.strictEqual(r.chain[1].level, 'patch')
  assert.strictEqual(r.chain[1].hit, true)
  assert.strictEqual(r.chain[2].shadowed, true)
  assert.strictEqual(r.chain[3].shadowed, true)
})

test('resolvePriority: config 命中时仅压制 fallback', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: undefined, patchMode: undefined, configMode: 'off' })
  assert.strictEqual(r.effective, 'off')
  assert.strictEqual(r.chain[2].level, 'config')
  assert.strictEqual(r.chain[2].hit, true)
  assert.strictEqual(r.chain[3].shadowed, true)
})

test('resolvePriority: env 值非法时降级并标注问题，不崩溃', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: 'ultra2', patchMode: undefined, configMode: 'lite' })
  assert.strictEqual(r.effective, 'lite')
  assert.strictEqual(r.chain[0].hit, false)
  assert.strictEqual(r.chain[0].shadowed, false)
  assert.strictEqual(r.chain[0].value, 'ultra2')
  assert.strictEqual(r.chain[0].problem, '值无效，已忽略')
  assert.strictEqual(r.chain[2].hit, true)
})

test('resolvePriority: config 值非法时标注文件损坏并落到兜底', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: undefined, patchMode: undefined, configMode: '{bad' })
  assert.strictEqual(r.effective, 'full')
  assert.strictEqual(r.chain[2].problem, '文件损坏或字段缺失')
  assert.strictEqual(r.chain[3].hit, true)
})

test('resolvePriority: patch 值非法时标注问题且继续向下寻找', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: undefined, patchMode: 'REVIEW', configMode: 'ultra' })
  assert.strictEqual(r.effective, 'ultra')
  assert.strictEqual(r.chain[1].value, 'REVIEW')
  assert.strictEqual(r.chain[1].problem, '值无效，已忽略')
  assert.strictEqual(r.chain[2].hit, true)
})

test('resolvePriority: 链的顺序与中文标签固定不变', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: undefined, patchMode: undefined, configMode: undefined })
  assert.deepStrictEqual(r.chain.map(s => s.level), ['env', 'patch', 'config', 'fallback'])
  assert.deepStrictEqual(r.chain.map(s => s.label), ['环境变量', 'Profile 补丁', '用户配置文件', '内置兜底'])
  assert.deepStrictEqual(r.chain.map(s => s.location), [
    'PONYTAIL_DEFAULT_MODE',
    'cordis.patch.yml',
    'config.json',
    '代码常量',
  ])
})
// ---------------------------------------------------------------------------
// C4：apply initialMode 与 resolvePriority 一致性锁定（优先级唯一真源）
// 背景：apply 旧判定把 patch 显式值（未归一）直接 state.set()，大小写/非法值会
// 注入垃圾态；resolvePriority 的 patch 级经 normalizeMode 校验。替换后必须一致。
// ---------------------------------------------------------------------------

test('C4 一致性: apply patch 大写变体归一为小写且 flag 落合法档', () => {
  let sectionText = null
  const ctx = {
    on: () => {},
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: (s) => { sectionText = s.text } },
  }
  delete process.env.PONYTAIL_DEFAULT_MODE
  apply(ctx, { defaultMode: 'LITE' })
  // state.set(initialMode) 会同步写 flag：断言 flag 内容是合法小写档
  assert.equal(readMode(), 'lite', 'patch 大写变体应归一为 lite，而非注入 LITE 垃圾态')
  // systemPrompt section 渲染等级也应是小写
  assert.match(String(sectionText()), /等级：lite/)
})

test('C4 一致性: resolvePriority patch 非法且 config 缺失时落内置兜底', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: undefined, patchMode: 'REVIEW', configMode: undefined })
  assert.strictEqual(r.effective, 'full')
  assert.strictEqual(r.chain[3].hit, true)
  assert.strictEqual(r.chain[3].shadowed, false)
})


// ---------------------------------------------------------------------------
// C7：默认档命令层分裂（真 bug 回归锁，production 接线级）
// 背景：apply 的 initialMode 与 UI 面板 defaultMode 走 resolvePriority（含 patch 层），
// 而 createCommandDispatcher 未注入 getDefaultMode 时走 getDefaultMode()（无 patch 层）。
// patch 层命中（cordis.patch.yml 显式 defaultMode=LITE）且 config.json 缺失时：
//   路径 A resolvePriority().effective = 'lite'（apply 启动 + UI 面板）
//   路径 B getDefaultMode()           = 'full'（命令层兜底切默认）
// /ponytail foobar（上游 else 兜底切默认档）会把等级从 lite 切到 full —— 静默不一致。
// ---------------------------------------------------------------------------

test('C4 生产接线: section 使用唯一提示词出口并按需同步外部 flag', () => {
  let sectionText
  const ctx = {
    on: () => {},
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: (section) => { sectionText = section.text } },
  }
  apply(ctx, { defaultMode: 'lite' })
  assert.match(String(sectionText()), /等级：lite/)
  setMode('ultra')
  assert.match(String(sectionText()), /等级：ultra/)
})

test('C7 默认档: patch 层命中时 /ponytail foobar 不偏离 resolvePriority effective', async () => {
  delete process.env.PONYTAIL_DEFAULT_MODE
  const handlers = {}
  const ctx = {
    on: (ev, h) => { handlers[ev] = h },
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
  }
  // 与 C4 同款接线：patch='LITE'（cordis.patch.yml 显式声明）；临时 DSH_HOME 无 config.json
  apply(ctx, { defaultMode: 'LITE' })
  assert.equal(readMode(), 'lite', '启动 flag 应为 lite（resolvePriority effective）')
  // 触发 agent/pre-step，消息含未知参数命令（上游 else 兜底切默认档）
  const next = async () => 'next'
  const ret = await handlers['agent/pre-step'](
    { messages: [{ content: '/ponytail foobar' }] },
    next,
  )
  assert.equal(ret, 'next', 'waterfall 必须 return await next()')
  // 现状（未注入 getDefaultMode）：dispatchText → parsePonytailCommand else 兜底 → getDefaultMode()='full'
  // → state.set('full') 写 flag；修复后：实时闭包 resolvePriority effective='lite'，flag 保持 lite
  assert.equal(readMode(), 'lite', '未知参数兜底切默认应取 resolvePriority effective（lite），不得切到 full')
})

test('C7 实时性: /ponytail default <档> 写盘后，下一次未知参数命令读到新默认值', async () => {
  // 评审 Important #2 回归锁：getDefaultMode 必须是实时闭包（每次重读 config.json），
  // 不能是启动期快照——否则 /ponytail default ultra 后 /ponytail foobar 仍切旧档
  delete process.env.PONYTAIL_DEFAULT_MODE
  const handlers = {}
  const ctx = {
    on: (ev, h) => { handlers[ev] = h },
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
  }
  apply(ctx, { defaultMode: 'lite' })
  assert.equal(readMode(), 'lite')
  // 1) 持久化新默认档 ultra（写 config.json）
  const next = async () => 'next'
  await handlers['agent/pre-step']({ messages: [{ content: '/ponytail default ultra' }] }, next)
  // 2) 下一次未知参数命令应切到新默认 ultra（若 getDefaultMode 是快照则仍切 lite，红）
  await handlers['agent/pre-step']({ messages: [{ content: '/ponytail foobar' }] }, next)
  assert.equal(readMode(), 'ultra', '写盘后未知参数兜底应切新默认 ultra（实时闭包），不得切回旧档 lite')
})

test('C4 一致性: resolvePriority env 带空白时 trim 后生效', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const r = resolvePriority({ envRaw: ' lite ', patchMode: undefined, configMode: undefined })
  assert.strictEqual(r.effective, 'lite')
  assert.strictEqual(r.chain[0].hit, true)
})


// 迁移到官方通道后，「列表 + 每项 enabled」不再由服务端组装：列表是构建期从
// frontmatter 提取的常量（lib/client.js 的 SKILL_META），enabled 就是配置快照里
// disabledSkills 的取反。因此这两项契约的落点从 HTTP 响应改为读侧函数与状态机。
test('C2 技能元数据: readSkillMeta 的描述与 frontmatter 逐字同源', async () => {
  const { readSkillMeta } = await import('../lib/ponytail-remote.js')
  const metas = readSkillMeta(skillDir)
  assert.equal(metas.length, 6)
  for (const meta of metas) {
    const raw = (await readFileFsp(join(skillDir, meta.id, 'SKILL.md'), 'utf8'))
    const end = raw.indexOf('\n---\n')
    const fm = (await import('yaml')).parse(raw.slice(4, end))
    assert.equal(meta.description, fm.description, meta.id + ' 描述必须与 frontmatter 一致')
  }
})

test('C2 技能启用态: 禁用后仍在技能目录内（可被重新启用），且不丢其他项', async () => {
  const { createPonytailState } = await import('../lib/ponytail-state.js')
  const state = createPonytailState({
    storage: { read: () => null, write: () => {}, clear: () => {} },
  })
  assert.equal(state.isSkillEnabled('ponytail-gain'), true)
  state.toggleSkill('ponytail-gain', false)
  assert.equal(state.isSkillEnabled('ponytail-gain'), false, '禁用后 enabled=false')
  state.toggleSkill('ponytail-debt', false)
  assert.deepEqual(state.getDisabledSkills().sort(), ['ponytail-debt', 'ponytail-gain'],
    '禁用列表是覆盖式累加：关一个不能影响另一个')
  state.toggleSkill('ponytail-gain', true)
  assert.deepEqual(state.getDisabledSkills(), ['ponytail-debt'], '重新启用只移除自己')
})

test('C2 技能元数据: frontmatter 不可读时回退内置兜底而非抛错', async () => {
  const { readSkillMeta } = await import('../lib/ponytail-remote.js')
  const metas = readSkillMeta(skillDir + '__missing__')
  assert.equal(metas.length, 6, '读不到目录时应回退内置元数据')
  assert.equal(metas[0].id, 'ponytail')
})

// ---------------------------------------------------------------------------
// C3：配置写盘字段级 merge（保留未知键）+ 孤儿函数清理
// ---------------------------------------------------------------------------

test('C3 写盘: writeFullConfig 保留 config.json 未知字段（字段级 merge）', async () => {
  const { writeFullConfig, readConfigFileText } = await import('../lib/ponytail-config.js')
  const configPath = join(process.env.DSH_HOME, 'ponytail', 'config.json')
  const { mkdir, writeFile: wf } = await import('node:fs/promises')
  await mkdir(join(process.env.DSH_HOME, 'ponytail'), { recursive: true })
  await wf(configPath, JSON.stringify({ defaultMode: 'lite', unknownKey: 'keep-me' }), 'utf8')
  const written = writeFullConfig({ defaultMode: 'ultra' })
  assert.equal(written?.defaultMode, 'ultra')
  const raw = JSON.parse((await import('node:fs/promises')).readFileSync ? '{}' : '{}')
  // 用 readConfigFileText 直接核对未知键保留
  const text = readConfigFileText()
  assert.ok(text.includes('unknownKey'), '未知字段必须保留（现状 writeFullConfig 会丢弃）')
  assert.ok(text.includes('"keep-me"'), '未知字段值必须原样保留')
  assert.ok(text.includes('"ultra"'), 'defaultMode 已更新')
})

test('C3 写盘: writeDefaultMode 非法值拒绝且不改文件', async () => {
  const { writeDefaultMode, readConfigFileText } = await import('../lib/ponytail-config.js')
  const before = readConfigFileText()
  const result = writeDefaultMode('bogus')
  assert.equal(result, null)
  const after = readConfigFileText()
  assert.equal(after, before, '非法 defaultMode 不得写盘')
})

test('C3 清理: config 版 isDeactivationCommand 与 normalizeConfigMode 已删除', async () => {
  const config = await import('../lib/ponytail-config.js')
  assert.equal(config.isDeactivationCommand, undefined, 'config 版孤儿 isDeactivationCommand 应删除（commands 保留）')
  assert.equal(config.normalizeConfigMode, undefined, 'normalizeConfigMode 孤儿应删除')
  const commands = await import('../lib/ponytail-commands.js')
  assert.equal(typeof commands.isDeactivationCommand, 'function', 'commands 版唯一实现保留')
})

// ---------------------------------------------------------------------------
// 官方配置组合（方案 B）：Config volatile 形状与配置通道 sink
// 背景：迁移到 Settings/configForms 后，可持久化字段改为 Cordis Config 的
// `.volatile()` 字段（落 profile patch），配置读写统一走 PonytailConfigSink。
// 探针已验证：union 自身可 volatile；volatileForm 投影出 defaultMode/disabledSkills。
// ---------------------------------------------------------------------------

// schemastery 3.18 的 toJSON() 是引用表形状：顶层给 uid，字段节点在 refs 里。
// helper 把 uid 引用还原成字段节点，门禁断言因此不依赖序列化布局。
function fieldNode(schema, name) {
  const json = schema.toJSON()
  const dict = json.refs[json.uid].dict
  return json.refs[dict[name]]
}

test('Config schema: defaultMode/disabledSkills 为 volatile 字段且仍无 Schema 默认值', () => {
  const mode = fieldNode(ConfigSchema, 'defaultMode')
  const disabled = fieldNode(ConfigSchema, 'disabledSkills')
  const provider = fieldNode(ConfigSchema, 'providerName')
  assert.equal(mode.meta.volatile, true, 'defaultMode 必须是 volatile 字段（否则不会出现在官方表单里）')
  assert.equal(disabled.meta.volatile, true, 'disabledSkills 必须是 volatile 字段')
  assert.equal(mode.meta.default, undefined, 'defaultMode 仍不得带 Schema 默认值（否则 shadow config.json 层）')
  assert.equal(provider.meta.volatile, undefined, 'providerName 保持普通配置，不进官方表单')
})

test('Config schema: volatile 字段解析为引用，未配置时读出 undefined 以让位优先级链', async () => {
  const Schema = (await import('@deepseek-ai/schemastery')).default
  const { readVolatile } = await import('../lib/ponytail-config.js')
  const [empty] = Schema.resolve({}, ConfigSchema)
  assert.equal(readVolatile(empty.defaultMode), undefined, '未配置时读出 undefined，让位 resolvePriority')
  // 空数组与「清空全部」语义相同：两者都表示无禁用项，无需区分。
  // 官方表单侧靠 revision 而非值来区分（unregister 一个从未设置的字段是 no-op）。
  assert.deepEqual(readVolatile(empty.disabledSkills), [], '未配置的 array volatile 读出空数组（无禁用项）')

  const [parsed] = Schema.resolve({ defaultMode: 'lite', disabledSkills: ['ponytail-help'] }, ConfigSchema)
  assert.equal(typeof parsed.defaultMode.get, 'function', '配置过则解析为 volatile 引用')
  assert.equal(readVolatile(parsed.defaultMode), 'lite')
  assert.deepEqual(readVolatile(parsed.disabledSkills), ['ponytail-help'])

  // 反向：裸值也要能读（测试直接构造 config 对象时出现）
  assert.equal(readVolatile('ultra'), 'ultra')
})

test('配置 sink: 无 settings 服务时回退 config.json（文件实现）', async () => {
  const { createFileSink, writeFullConfig } = await import('../lib/ponytail-settings.js')
  const sink = createFileSink()
  sink.reset()
  assert.equal(sink.readDefaultMode(), 'full', '空配置回落到 DEFAULT_MODE')
  assert.deepEqual(sink.readDisabled(), [])
  assert.equal(sink.writeDefaultMode('ultra'), 'ultra')
  assert.equal(sink.readDefaultMode(), 'ultra', '写盘后立即读回')
  assert.equal(sink.writeDefaultMode('bogus'), null, '非法档拒绝写盘')
  assert.equal(sink.readDefaultMode(), 'ultra', '非法写盘不得改变既有值')
  sink.writeDisabled(['ponytail-help'])
  assert.deepEqual(sink.readDisabled(), ['ponytail-help'])
  sink.reset()
  assert.equal(sink.readDefaultMode(), 'full')
  assert.deepEqual(sink.readDisabled(), [])
})

test('配置 sink: settings 实现经 settings.mutate 写入并回读', async () => {
  const { createSettingsSink } = await import('../lib/ponytail-settings.js')
  const calls = []
  const store = { defaultMode: 'full', disabledSkills: [] }
  const settings = {
    mutate: async (ns, ops, revision) => {
      calls.push({ ns, ops, revision })
      for (const op of ops) {
        if (op.op === 'set') store[op.path[0]] = op.value
        else if (op.op === 'unset') delete store[op.path[0]]
      }
      // 官方回执形状：dsh-api-settings-controller/lib/index.js:474 返回 namespaceView(descriptor)
      return { ns: 'ponytail', revision: (revision ?? 0) + 1, value: { ...store }, base: {}, user: { ...store } }
    },
    describe: () => ({ namespaces: [{ ns: 'ponytail', revision: 7, value: { ...store } }] }),
  }
  const sink = createSettingsSink({ settings }, 'ponytail')
  assert.equal(sink.writeDefaultMode('lite'), 'lite')
  assert.equal(calls[0].ns, 'ponytail')
  assert.deepEqual(calls[0].ops, [{ op: 'set', path: ['defaultMode'], value: 'lite' }])
  sink.writeDisabled(['ponytail-audit'])
  assert.deepEqual(calls[1].ops, [{ op: 'set', path: ['disabledSkills'], value: ['ponytail-audit'] }])
  assert.equal(sink.readDefaultMode(), 'lite', 'mutate 后本地镜像即生效')
  assert.deepEqual(sink.readDisabled(), ['ponytail-audit'])
  sink.reset()
  assert.deepEqual(calls[2].ops, [
    { op: 'unset', path: ['defaultMode'] },
    { op: 'unset', path: ['disabledSkills'] },
  ])
  assert.equal(sink.readDefaultMode(), 'full', 'unset 后回落到内置兜底')
})

test('配置 sink: settings 写入被拒时不抛未处理拒绝，而是记 warn 并等下一次读取纠正', async () => {
  const { createSettingsSink } = await import('../lib/ponytail-settings.js')
  const warnings = []
  const settings = {
    mutate: async () => { throw new Error('Config field "defaultMode" is not volatile') },
    describe: () => ({ namespaces: [] }),
  }
  const sink = createSettingsSink({ settings }, 'ponytail', { logger: { warn: (m) => warnings.push(m) } })
  assert.equal(sink.writeDefaultMode('lite'), 'lite', '乐观返回：同步调用方仍拿到归一后的档位')
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(warnings.length, 1, '拒绝必须被记录，不能静默')
  assert.match(warnings[0], /被拒/)
})

test('legacy 迁移: config.json 有值且 profile 未设时导入一次（第二次幂等跳过）', async () => {
  const { migrateLegacyConfig } = await import('../lib/ponytail-settings.js')
  const logs = []
  const stored = { defaultMode: 'ultra', disabledSkills: ['ponytail-help'] }
  let renamed = 0
  let updates = 0

  const makeSettings = () => ({
    update: async (_ns, patch) => { updates++; Object.assign(stored, patch) },
    // describe 反映 profile 侧的真实状态：第一次为空，导入后才有该命名空间
    describe: () => ({ namespaces: updates === 0 ? [] : [{ ns: 'ponytail', value: {} }] }),
  })

  const deps = () => ({
    settings: makeSettings(),
    namespace: 'ponytail',
    readLegacy: () => ({ defaultMode: 'ultra', disabledSkills: ['ponytail-help'] }),
    renameLegacy: async () => { renamed++ },
    logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m) },
  })

  const first = await migrateLegacyConfig(deps())
  assert.equal(first, true, '应执行一次迁移')
  assert.equal(stored.defaultMode, 'ultra')
  assert.deepEqual(stored.disabledSkills, ['ponytail-help'])
  assert.equal(renamed, 1, '旧文件应被改名一次')
  assert.equal(updates, 1, '只应写一次')

  const second = await migrateLegacyConfig(deps())
  assert.equal(second, false, 'profile 已设时不得重复迁移')
  assert.equal(renamed, 1, '幂等路径不得再次改名')
  assert.equal(updates, 1, '幂等路径不得再次写入')
})

test('legacy 迁移: config.json 无内容时不迁移', async () => {
  const { migrateLegacyConfig } = await import('../lib/ponytail-settings.js')
  const result = await migrateLegacyConfig({
    settings: { update: async () => {}, describe: () => ({ namespaces: [] }) },
    namespace: 'ponytail',
    readLegacy: () => ({ defaultMode: 'full', disabledSkills: [] }),
    renameLegacy: async () => {},
    logger: { info: () => {}, warn: () => {} },
  })
  assert.equal(result, false)
})

test('C8 volatile: profile 补丁的 defaultMode 引用被改后，优先级链读到新值', async () => {
  const { resolvePriority } = await import('../lib/ponytail-priority.js')
  const { readVolatile } = await import('../lib/ponytail-config.js')
  // 模拟宿主在 defaultMode 字段上放的 volatile 引用：官方 loader 就地更新它
  let current = 'lite'
  const ref = Object.freeze({ get: () => current })
  assert.equal(readVolatile(ref), 'lite')

  // 启动时读一次
  assert.equal(resolvePriority({ patchMode: readVolatile(ref) }).effective, 'lite')

  // 官方表单写入后 loader 就地改引用（不重挂载），下一次求值必须读到新档
  current = 'ultra'
  assert.equal(readVolatile(ref), 'ultra')
  assert.equal(resolvePriority({ patchMode: readVolatile(ref) }).effective, 'ultra',
    '不得缓存启动期快照——否则 UI 改了档位而运行不生效（静默失效）')
})

test('C8 apply 接线: 同一个 apply 实例内，引用就地改值后兜底档读到新值', async () => {
  delete process.env.PONYTAIL_DEFAULT_MODE
  let current = 'lite'
  const ref = Object.freeze({ get: () => current })
  const handlers = {}
  const ctx = {
    on: (ev, h) => { handlers[ev] = h },
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
  }
  apply(ctx, { defaultMode: ref })
  assert.equal(readMode(), 'lite', '启动档应取引用内的值')

  // 官方表单写入后 loader 就地改引用（不重挂载插件）。同一个 apply 实例里
  // 未知参数兜底必须读到新档——若 readPatchMode 是启动期快照，这里会切回 lite 而红。
  current = 'ultra'
  await handlers['agent/pre-step']({ messages: [{ content: '/ponytail foobar' }] }, async () => 'next')
  assert.equal(readMode(), 'ultra', '兜底档必须来自引用当前值（实时），不得是启动快照')
})

test('C8 apply 接线: 无 settings 服务时配置通道回退 config.json 且不抛错', async () => {
  const handlers = {}
  const logs = []
  const ctx = {
    on: (ev, h) => { handlers[ev] = h },
    effect: () => {},
    logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m), debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
    // 故意不给 settings：模拟 headless / 无 profileContext 的组合
  }
  assert.doesNotThrow(() => apply(ctx, {}))
  // 命令层写入必须落到 config.json（回退通道）
  await handlers['agent/pre-step']({ messages: [{ content: '/ponytail default lite' }] }, async () => 'next')
  const { readConfigFileText } = await import('../lib/ponytail-config.js')
  const raw = readConfigFileText()
  assert.ok(raw !== null, '回退通道必须写 config.json')
  assert.equal(JSON.parse(raw).defaultMode, 'lite')
})

test('C9 volatile-update: disabledSkills 变更后技能目录立即失效', async () => {
  const handlers = {}
  let invalidated = 0
  let providerControl = { invalidate: () => { invalidated++ } }
  const ctx = {
    on: (ev, h) => { handlers[ev] = h },
    effect: (setup) => setup(),
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: {
      registerProvider: (factory) => {
        // 模拟宿主拿 provider 工厂并创建实例：拿到 control 以便断言 invalidate 被调用
        const fakeControl = providerControl
        const instance = factory(fakeControl)
        // 实例化 provider 会真实读 skills/ 目录，这里只关心失效调用
        void instance
        return () => {}
      },
    },
    systemPrompt: { section: () => () => {} },
  }
  apply(ctx, {})
  assert.ok(handlers['loader/volatile-update'], '必须监听 loader/volatile-update，否则 UI 改技能开关后模型侧目录不收敛（静默失效）')
  handlers['loader/volatile-update']([['disabledSkills']])
  assert.equal(invalidated, 1, 'disabledSkills 变更必须让 provider 失效一次')
})

test('C9 volatile-update: defaultMode 变更后清掉乐观缓存（不再压过引用值）', async () => {
  delete process.env.PONYTAIL_DEFAULT_MODE
  let current = 'lite'
  const ref = Object.freeze({ get: () => current })
  const handlers = {}
  const ctx = {
    on: (ev, h) => { handlers[ev] = h },
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
  }
  apply(ctx, { defaultMode: ref })
  // 命令层写入乐观值 ultra（此刻引用还是 lite）
  await handlers['agent/pre-step']({ messages: [{ content: '/ponytail default ultra' }] }, async () => 'next')
  assert.equal(readMode(), 'ultra', '命令写入后立即生效')

  // 官方提交后 loader 派发事件：引用已更新为 full，乐观缓存必须让位
  current = 'full'
  handlers['loader/volatile-update']([['defaultMode']])
  await handlers['agent/pre-step']({ messages: [{ content: '/ponytail foobar' }] }, async () => 'next')
  assert.equal(readMode(), 'full', '收到 volatile 更新后必须读引用值（full），不得继续用陈旧的乐观缓存（ultra）')
})

test('C9 volatile-update: 与 disabledSkills 无关的路径不触发失效', async () => {
  const handlers = {}
  let invalidated = 0
  const ctx = {
    on: (ev, h) => { handlers[ev] = h },
    effect: (setup) => setup(),
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: {
      registerProvider: (factory) => {
        factory({ invalidate: () => { invalidated++ } })
        return () => {}
      },
    },
    systemPrompt: { section: () => () => {} },
  }
  apply(ctx, {})
  handlers['loader/volatile-update']([['defaultMode']])
  assert.equal(invalidated, 0, 'defaultMode 变更不应让技能目录失效（列表没变）')
})

test('C10 命令写入: 有 settings 服务时 /ponytail default 走 settings 通道而非 config.json', async () => {
  const mutateCalls = []
  let profile = { defaultMode: 'lite', disabledSkills: [] }
  // 全部用例共用同一个临时 DSH_HOME：先清掉前序用例可能留下的 config.json，
  // 否则「未写 config.json」这条断言会被前序残留顶红。
  // node:test 同级用例默认并发执行：本文件里另一项「无 settings 回退」用例会写
  // config.json，共享同一个临时 DSH_HOME 时会把「未写」这条断言顶红。
  // 隔离办法：给本用例单独一个 DSH_HOME 子目录，跑完恢复。
  const { mkdtemp } = await import('node:fs/promises')
  const { join: joinPath } = await import('node:path')
  const isolatedHome = await mkdtemp(joinPath(tmpDsh, 'c10-'))
  const savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = isolatedHome

  const settings = {
    describe: () => ({ namespaces: [{ ns: 'ponytail', revision: 3, value: { ...profile } }] }),
    mutate: async (ns, ops, revision) => {
      mutateCalls.push({ ns, ops, revision })
      for (const op of ops) {
        if (op.op === 'set') profile[op.path[0]] = op.value
        else delete profile[op.path[0]]
      }
      return { ns, revision: revision + 1, value: { ...profile } }
    },
    update: async () => ({}),
  }
  const handlers = {}
  const ctx = {
    settings,
    on: (ev, h) => { handlers[ev] = h },
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
  }
  delete process.env.PONYTAIL_DEFAULT_MODE
  apply(ctx, {})
  await new Promise((r) => setTimeout(r, 10))
  await handlers['agent/pre-step']({ messages: [{ content: '/ponytail default ultra' }] }, async () => 'next')
  await new Promise((r) => setTimeout(r, 5))

  assert.equal(mutateCalls.length >= 1, true, '命令写入必须经 settings.mutate（官方路径）')
  const modeWrite = mutateCalls.find((c) => c.ops.some((op) => op.path[0] === 'defaultMode'))
  assert.ok(modeWrite, '必须有一次写 defaultMode 的 mutate')
  assert.equal(modeWrite.ns, 'ponytail')
  assert.deepEqual(modeWrite.ops, [{ op: 'set', path: ['defaultMode'], value: 'ultra' }])

  // 断言问的是「官方新路径没写盘」，不是「readConfigFileText() 为 null」：
  // 后者会回退读旧平台路径（%APPDATA%/ponytail/config.json），本机恰好存在该文件，
  // 于是断言被无关的历史数据顶红。
  const { existsSync } = await import('node:fs')
  const { getConfigPath } = await import('../lib/ponytail-config.js')
  const wroteConfigJson = existsSync(getConfigPath())
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
  await rm(isolatedHome, { recursive: true, force: true })
  assert.equal(wroteConfigJson, false, '有 settings 服务时不得再写 config.json（唯一真源），否则两份配置会分叉')
})

test('C10 命令写入: 无 settings 服务时 /ponytail default 回退写 config.json', async () => {
  // 同级用例并发执行：单独隔离 DSH_HOME，否则两项 C10 会互相污染
  const { mkdtemp } = await import('node:fs/promises')
  const { join: joinPath } = await import('node:path')
  const isolatedHome = await mkdtemp(joinPath(tmpDsh, 'c10b-'))
  const savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = isolatedHome

  const handlers = {}
  const ctx = {
    // 不给 settings：模拟 headless / CLI 组合
    on: (ev, h) => { handlers[ev] = h },
    effect: () => {},
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
  }
  delete process.env.PONYTAIL_DEFAULT_MODE
  apply(ctx, {})
  await handlers['agent/pre-step']({ messages: [{ content: '/ponytail default lite' }] }, async () => 'next')
  const { readConfigFileText } = await import('../lib/ponytail-config.js')
  const raw = readConfigFileText()
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
  await rm(isolatedHome, { recursive: true, force: true })
  assert.ok(raw !== null, '无 settings 服务时必须写 config.json（否则这些组合彻底失去配置能力）')
  assert.equal(JSON.parse(raw).defaultMode, 'lite')
})


test('C11 Remote 通道: 服务注册为 ponytailRemote 且命名空间为 ponytail', async () => {
  const { PonytailRemote } = await import('../lib/ponytail-remote.js')
  const { Context } = await import('@deepseek-ai/cordis')
  const { remoteMethods } = await import('@deepseek-ai/dsh-typert-protocol')
  const ctx = new Context()
  // ctx.plugin() 返回 fiber：服务在 fiber commit 时才注册，必须 await 生效后再回读
  await ctx.plugin(PonytailRemote, {
    snapshot: () => ({ currentMode: 'lite', priority: { chain: [], effective: 'lite' } }),
  })

  const service = ctx.get('ponytailRemote')
  assert.ok(service, '必须提供 ponytailRemote 服务，否则浏览器侧 ctx.remote.ponytail 不存在')
  const marked = remoteMethods(service)
  assert.equal(marked.length, 1, '必须恰好暴露一个端点')
  assert.equal(marked[0].method, 'snapshot', '端点名必须是 snapshot（客户端按此调用）')

  const binding = Reflect.get(service, 'typertRemote')
  assert.equal(binding.namespace, 'ponytail', '线缆命名空间必须是 ponytail（客户端挂成 ctx.remote.ponytail）')
})

test('C11 Remote 通道: snapshot 返回当前等级与四级诊断链', async () => {
  const { PonytailRemote } = await import('../lib/ponytail-remote.js')
  const { Context } = await import('@deepseek-ai/cordis')
  const { resolvePriority } = await import('../lib/ponytail-priority.js')

  const report = resolvePriority({ envRaw: undefined, patchMode: 'lite', configMode: 'full' })
  const ctx = new Context()
  await ctx.plugin(PonytailRemote, {
    snapshot: () => ({ currentMode: 'lite', priority: report }),
  })

  const value = ctx.get('ponytailRemote').snapshot()
  assert.equal(value.currentMode, 'lite', '当前生效等级必须下发')
  assert.equal(value.priority.effective, 'lite')
  assert.equal(value.priority.chain.length, 4, '诊断链恒 4 项')
  assert.equal(value.priority.chain[1].level, 'patch')
  assert.equal(value.priority.chain[1].hit, true, 'patch 层命中必须标出来（否则用户不知道为什么改了没用）')
  // 线缆约束：返回值必须是 lossless JSON（typert-protocol 的 isRemoteJsonValue）
  const { isRemoteJsonValue } = await import('@deepseek-ai/dsh-typert-protocol')
  assert.equal(isRemoteJsonValue(value), true, '返回值必须能无损过线缆（否则浏览器收到后类型不符）')
})

test('C11 技能元数据: readSkillMeta 从 frontmatter 提取 6 项（真源唯一）', async () => {
  const { readSkillMeta } = await import('../lib/ponytail-remote.js')
  const { fileURLToPath } = await import('node:url')
  const skillDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills')
  const metas = readSkillMeta(skillDir)
  assert.equal(metas.length, 6, '随包发布 6 个技能')
  assert.ok(metas.every((m) => typeof m.description === 'string' && m.description.length > 0),
    '描述来自 SKILL.md frontmatter，不得为空')
  assert.ok(metas.some((m) => m.id === 'ponytail-review'), '目录名即技能 id')
})

test('C11 技能元数据: 目录不可读时回退兜底列表而非抛错', async () => {
  const { readSkillMeta } = await import('../lib/ponytail-remote.js')
  const metas = readSkillMeta(path.join(tmpDsh, 'no-such-skill-dir'))
  assert.equal(metas.length, 6, '坏目录不得让面板空白')
  assert.ok(metas.every((m) => typeof m.description === 'string' && m.description.length > 0))
})


test('C11 生产接线: apply 在具备 ctx.plugin 的宿主上挂载 ponytailRemote 命名空间', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { remoteMethods } = await import('@deepseek-ai/dsh-typert-protocol')
  const ctx = new Context()
  // 补齐 apply 需要的最小服务面
  ctx.skills = { registerProvider: () => () => {} }
  ctx.systemPrompt = { section: () => () => {} }
  ctx.logger = { info: () => {}, warn: () => {}, debug: () => {} }
  ctx.on = () => {}
  ctx.effect = (setup) => { const r = setup(); return () => {} }

  apply(ctx, {})
  // ctx.plugin 返回的 fiber 需要 await：服务在 fiber commit 时才注册。
  // 真实宿主（loader）在下一次 tick 完成，这里等一个宏任务即可。
  await new Promise((r) => setTimeout(r, 10))
  const service = ctx.get('ponytailRemote')
  assert.ok(service, 'apply 必须挂上远程快照服务（否则浏览器侧优先级面板拿不到数据）')
  const marked = remoteMethods(service)
  assert.equal(marked.length, 1)
  assert.equal(marked[0].method, 'snapshot')
  assert.equal(Reflect.get(service, 'typertRemote').namespace, 'ponytail')
})

test('C12 客户端产物: apply 只经官方通道接线，不发任何 HTTP 请求', async () => {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const artifact = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js'), 'utf8')

  // 用最小 require 桩执行产物，验证接线而不只是匹配字符串。
  const calls = { locale: [], slots: [], configForms: [], http: [] }
  const disposers = []
  const facade = {
    snapshot: async () => ({ ok: true, value: { currentMode: 'lite', priority: { chain: [], effective: 'lite' } } }),
  }
  const stubs = {
    react: {
      createElement: () => null,
      useState: () => [null, () => {}],
      useEffect: () => {},
      useCallback: (fn) => fn,
      useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
    },
    '@deepseek-ai/dsh-client-ui-primitives': {
      StateDot: 'StateDot', Tag: 'Tag', SegmentedControl: 'SegmentedControl',
      Switch: 'Switch', Button: 'Button',
    },
  }
  const globalStubs = {
    window: {
      __ModuleLoader__: {
        load(payload) {
          const mod = payload.factory((name) => {
            if (name in stubs) return stubs[name]
            throw new Error('unexpected require: ' + name)
          })
          const ctx = {
            effect: (setup) => { const d = setup(); if (typeof d === 'function') disposers.push(d) },
            on: () => () => {},
            logger: { warn() {}, info() {}, debug() {} },
            locale: {
              register: (ns, dict) => { calls.locale.push({ ns, keys: Object.keys(dict.zh).length }); return () => {} },
              bind: () => (k) => k,
              subscribe: () => () => {},
            },
            slots: {
              inject: (name, register) => {
                const d = register()
                calls.slots.push({ name, key: d.options.key })
                disposers.push(d)
                return () => {}
              },
              register: (options, component) => ({ options, component }),
            },
            configForms: {
              get: (ns) => {
                calls.configForms.push({ op: 'get', ns })
                return {
                  getSnapshot: () => ({ status: 'ready', value: {}, base: {}, user: {}, revision: 1, writable: true }),
                  subscribe: () => () => {},
                  mutate: async () => true,
                  dispose: () => {},
                }
              },
              whileServed: (namespaces, register) => {
                calls.configForms.push({ op: 'whileServed', namespaces })
                const d = register(new Set(namespaces))
                return d
              },
            },
            get: (key) => (key === 'remote.ponytail' ? facade : undefined),
          }
          globalThis.fetch = (...args) => { calls.http.push(String(args[0])); throw new Error('HTTP must not be used') }
          mod.apply(ctx)
        },
      },
    },
  }
  const savedWindow = globalThis.window
  const savedFetch = globalThis.fetch
  Object.assign(globalThis, globalStubs)
  try {
    // 产物是「顶层立即调用 window.__ModuleLoader__.load({...})」的脚本：
    // 直接在挂了桩的全局上求值它，即可捕获 factory 并触发 apply。
    const run = new Function(artifact)
    run.call(globalThis)
  } finally {
    if (savedWindow === undefined) delete globalThis.window
    else globalThis.window = savedWindow
    if (savedFetch === undefined) delete globalThis.fetch
    else globalThis.fetch = savedFetch
    for (const d of disposers.splice(0)) { try { d() } catch {} }
  }

  assert.deepEqual(calls.http, [], '客户端产物不得发起任何 HTTP 请求（已迁移到官方通道）')
  assert.deepEqual(calls.configForms.filter((c) => c.op === 'get').map((c) => c.ns), ['ponytail'],
    '必须经 configForms.get("ponytail") 读官方配置')
  assert.deepEqual(calls.configForms.filter((c) => c.op === 'whileServed').map((c) => c.namespaces), [['ponytail']],
    '必须经 whileServed(["ponytail"]) 跟随命名空间')
  assert.deepEqual(calls.slots.map((s) => s.name), ['plugins.bundle.config'], 'UI 落点唯一')
  assert.deepEqual(calls.slots.map((s) => s.key), ['@wenaixi/dsh-ponytail'], '插槽 key 为包名')
  assert.equal(calls.locale.length, 1, '必须注册一次双语字典')
})
