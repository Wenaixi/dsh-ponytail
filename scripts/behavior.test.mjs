import { before, after, test } from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { createPonytailState } from '../lib/ponytail-state.js'
import { setMode, readMode, clearMode } from '../lib/ponytail-runtime.js'
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
test('Config schema: defaultMode 无 Schema 默认值（config.json 默认档可达）', () => {
  const cfg = ConfigSchema({})
  assert.equal(cfg.defaultMode, undefined, 'defaultMode 应为 undefined（未配置时让位 getDefaultMode()）')
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

