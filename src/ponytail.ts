/**
 * dsh-ponytail — DSH 完整移植版 ponytail (dietrichgebert/ponytail 4.10.0)
 *
 * 能力全集：
 * - always-on 梯子注入（systemPrompt section，随 mode 动态裁剪）
 * - 6 个 skill：ponytail / ponytail-review / ponytail-audit / ponytail-debt / ponytail-gain / ponytail-help
 * - 完整复刻 hooks 行为：activate / mode-tracker / subagent / config / instructions / runtime
 * - 不注册空 tool，全部能力经 Skill 暴露
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import type { Context } from '@deepseek-ai/cordis'
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderControl,
  SkillProviderObservation,
} from '@deepseek-ai/dsh-skill'
import Schema from '@deepseek-ai/schemastery'

import {
  DEFAULT_MODE,
  getDefaultMode,
  isShellSafe,
  normalizeMode,
  writeDefaultMode,
} from './ponytail-config.js'
import { parsePonytailCommand } from './ponytail-commands.js'
import { filterSkillBodyForMode, getFallbackInstructions, getMainSkillPath } from './ponytail-instructions.js'
import { createPonytailState } from './ponytail-state.js'

// ---------------------------------------------------------------------------
// Config — 遵循 references/config.md：Schemastery + 默认值进 schema
// ---------------------------------------------------------------------------

export interface Config {
  /** 注册到 ctx.skills 的 provider 名称 */
  providerName?: string
  /** skill 目录绝对路径，默认取包内 skills/ */
  skillDir?: string
  /** 默认强度，off 则不自动激活 */
  defaultMode?: 'off' | 'lite' | 'full' | 'ultra'
}

export const Config: Schema<Config> = Schema.object({
  providerName: Schema.string().default('ponytail'),
  skillDir: Schema.string(),
  defaultMode: Schema.union(['off', 'lite', 'full', 'ultra']).default('full'),
})

// ---------------------------------------------------------------------------
// 插件元信息
// ---------------------------------------------------------------------------

export const name = 'ponytail'
export const inject = ['skills', 'systemPrompt'] as const

// ---------------------------------------------------------------------------
// 工具函数（与 superpowers 同款健壮版）
// ---------------------------------------------------------------------------

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PONYTAIL_RANK = 550

function isSkillName(v: string): boolean {
  return SKILL_NAME_RE.test(v)
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

// 读取任意对象字段（metadata）；仅当值为非数组对象时返回原对象，其余返回 undefined
function readObject(data: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = data[key]
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

function frontmatterBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(data, key)) return undefined
  const v = data[key]
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1') return true
  if (v === 0 || v === '0') return false
  if (typeof v === 'string') {
    switch (v.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
        return true
      case 'false':
      case 'no':
      case 'off':
        return false
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`)
}

function rejectLegacyKey(data: Record<string, unknown>, legacy: string, canonical: string): void {
  if (Object.hasOwn(data, legacy)) {
    throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`)
  }
}

function parseInvocationPolicy(data: Record<string, unknown>) {
  rejectLegacyKey(data, 'disableModelInvocation', 'disable-model-invocation')
  rejectLegacyKey(data, 'modelInvocable', 'disable-model-invocation')
  rejectLegacyKey(data, 'userInvocable', 'user-invocable')
  const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation')
  const userInvocable = frontmatterBoolean(data, 'user-invocable')
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  }
}

function readMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const v = readObject(data, 'metadata')
  return v ? { metadata: v } : {}
}

function findClosingFrontmatter(raw: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start
  while (lineStart <= raw.length) {
    const nl = raw.indexOf('\n', lineStart)
    const lineEnd = nl < 0 ? raw.length : nl
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return { start: lineStart, bodyStart: nl < 0 ? raw.length : nl + 1 }
    }
    if (nl < 0) return undefined
    lineStart = nl + 1
  }
  return undefined
}

function parseFrontmatter(
  raw: string,
): { data: Record<string, unknown>; body: string } | undefined {
  const firstNl = raw.indexOf('\n')
  if (firstNl < 0) return undefined
  if (raw.slice(0, firstNl).replace(/\r$/, '') !== '---') return undefined
  const start = firstNl + 1
  const closing = findClosingFrontmatter(raw, start)
  if (!closing) return undefined
  const parsed = parse(raw.slice(start, closing.start))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  return { data: parsed as Record<string, unknown>, body: raw.slice(closing.bodyStart) }
}

function resolveDefaultSkillDir(configSkillDir?: string): string {
  if (configSkillDir) return resolve(configSkillDir)
  try {
    const here = fileURLToPath(import.meta.url)
    return resolve(dirname(here), '..', 'skills')
  } catch {
    return resolve('skills')
  }
}

// ---------------------------------------------------------------------------
// SkillProvider（完整复刻上游 6 skill 的 discovery）
// ---------------------------------------------------------------------------

class PonytailProvider implements SkillProvider {
  readonly name: string
  private readonly skillDir: string
  private readonly ctx: Context

  constructor(ctx: Context, _control: SkillProviderControl, config: Config) {
    this.ctx = ctx
    this.name = config.providerName ?? 'ponytail'
    this.skillDir = resolveDefaultSkillDir(
      (config as Record<string, unknown>)['skillDir'] as string | undefined,
    )
  }

  async list(options: SkillLookupOptions): Promise<readonly SkillCandidate[] | SkillProviderObservation> {
    options.signal?.throwIfAborted()
    const candidates: SkillCandidate[] = []
    let entries: import('node:fs').Dirent[]
    // @types/node 22.x 的 readdir 选项类型未含 signal（Node 运行时自 16 起支持），
    // 用带 signal 字段的局部变量透传，signal 本身仍受 AbortSignal 类型检查
    const readdirOpts: { withFileTypes: true; signal?: AbortSignal } = {
      withFileTypes: true,
      signal: options.signal,
    }
    try {
      entries = await readdir(this.skillDir, readdirOpts)
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        this.ctx.logger.warn(`[ponytail] 未找到 skill 目录：${this.skillDir}`)
        // 显式 observation：发现未完成，不可缓存（官方 SkillProviderObservation 语义）
        return { candidates: [], complete: false }
      }
      throw err
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue
      const skillPath = join(this.skillDir, entry.name, 'SKILL.md')
      try {
        // stat 选项类型未含 signal，运行时多余字段被忽略；已 abort 场景由首行 throwIfAborted 兜底
        await stat(skillPath, { signal: options.signal } as never)
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') throw err
        continue
      }
      const parsed = await parseSkillFile(skillPath, options.signal)
      if (!parsed) {
        this.ctx.logger.warn(`[ponytail] 跳过 ${entry.name}：缺少或无效的 frontmatter`)
        continue
      }
      const { data, body } = parsed
      const skillName = readString(data, 'name')
      const description = readString(data, 'description')
      if (!skillName || !description) {
        this.ctx.logger.warn(`[ponytail] 跳过 ${skillPath}：frontmatter 必须包含 name 和 description`)
        continue
      }
      if (!isSkillName(skillName)) {
        this.ctx.logger.warn(`[ponytail] 跳过 ${skillPath}：无效的 skill 名称 "${skillName}"`)
        continue
      }
      if (skillName !== entry.name) {
        this.ctx.logger.warn(
          `[ponytail] skill 名称 "${skillName}" 与目录 "${entry.name}" 不一致（以 frontmatter 为准）`,
        )
      }
      const whenToUse = readString(data, 'whenToUse')
      let invocation: { modelInvocable: boolean; userInvocable: boolean }
      try {
        invocation = parseInvocationPolicy(data)
      } catch (e) {
        this.ctx.logger.warn(`[ponytail] 跳过 ${skillPath}：${String(e)}`)
        continue
      }

      candidates.push({
        name: skillName,
        description,
        ...(whenToUse ? { whenToUse } : {}),
        invocation,
        source: 'bundled',
        provider: this.name,
        rank: PONYTAIL_RANK,
        locator: { path: skillPath, directory: dirname(skillPath) },
        resourceBase: { kind: 'directory', path: dirname(skillPath) },
        path: skillPath,
        ...readMetadata(data),
      } as SkillCandidate)
      void body
    }

    return candidates
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    options.signal?.throwIfAborted()
    const locator = candidate.locator as { path: string; directory: string }
    const parsed = await parseSkillFile(locator.path, options.signal)
    if (!parsed) return undefined
    const data = parsed.data
    const skillName = readString(data, 'name')
    const description = readString(data, 'description')
    if (!skillName || !description) return undefined
    if (skillName !== candidate.name) return undefined
    const whenToUse = readString(data, 'whenToUse')
    let invocation: { modelInvocable: boolean; userInvocable: boolean }
    try {
      invocation = parseInvocationPolicy(data)
    } catch {
      return undefined
    }
    return {
      name: skillName,
      description,
      ...(whenToUse ? { whenToUse } : {}),
      invocation,
      source: 'bundled',
      provider: this.name,
      resourceBase: { kind: 'directory', path: locator.directory },
      path: locator.path,
      ...readMetadata(data),
      content: parsed.body.trim(),
    }
  }
}

async function parseSkillFile(
  path: string,
  signal?: AbortSignal,
): Promise<{ data: Record<string, unknown>; body: string } | undefined> {
  let raw: string
  try {
    raw = await readFile(path, { encoding: 'utf8', signal })
  } catch (err: unknown) {
    // abort 冒泡（settle promptly），其余读取错误视为不可加载
    if (err instanceof Error && err.name === 'AbortError') throw err
    return undefined
  }
  try {
    const parsed = parseFrontmatter(raw)
    if (!parsed) return undefined
    return parsed
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

export function apply(ctx: Context, config: Config = {} as Config): void {
  const rawConfig = config as Record<string, unknown>
  const resolved: Config = {
    providerName: (rawConfig['providerName'] as string | undefined) ?? 'ponytail',
    ...(rawConfig['skillDir'] !== undefined ? { skillDir: rawConfig['skillDir'] as string } : {}),
    defaultMode: (rawConfig['defaultMode'] as Config['defaultMode']) ?? DEFAULT_MODE,
  }

  // 优先级：PONYTAIL_DEFAULT_MODE env > cordis config 的 defaultMode（显式）> 配置文件 > full
  // 与上游 ponytail-config.js 的 getDefaultMode(env > file > full) 保持一致，
  // 但 cordis 显式配置应夹在 env 与 file 之间
  const envRaw = process.env['PONYTAIL_DEFAULT_MODE']
  const envMode = envRaw ? normalizeMode(envRaw) : null
  if (envRaw && !envMode) {
    // ponytail: env 非法值静默回退与上游一致，此处 warn 为 DSH 差分（不改变回退语义），便于定位配置错误
    ctx.logger.warn(`[ponytail] PONYTAIL_DEFAULT_MODE 值无效（回退后续来源）：${envRaw}`)
  }
  let initialMode: string | null
  if (envMode) {
    initialMode = envMode
  } else if (rawConfig['defaultMode'] !== undefined) {
    initialMode = resolved.defaultMode as string
  } else {
    initialMode = getDefaultMode()
  }

  const skillDir = resolveDefaultSkillDir(resolved.skillDir)
  const mainSkillPath = getMainSkillPath(skillDir)

  // 等级状态唯一归属：get()/set()/syncFromFile() 三方法，闭包态随 HMR 重建
  const state = createPonytailState()
  state.set(initialMode === 'off' ? null : initialMode)

  if (state.get()) {
    ctx.logger.info(`[ponytail] 已激活 — 等级：${state.get()}（skillDir: ${skillDir}）`)
  } else {
    ctx.logger.info('[ponytail] 已关闭 — 直到 /ponytail 再次激活前不注入')
  }

  if (skillDir && !isShellSafe(skillDir)) {
    ctx.logger.warn(`[ponytail] skillDir 包含 shell 元字符，请检查路径：${skillDir}`)
  }

  // SkillProvider 注册
  const skills = (ctx as unknown as { skills: { registerProvider: (factory: (control: SkillProviderControl) => SkillProvider) => () => void } }).skills
  skills.registerProvider((control) => new PonytailProvider(ctx, control, resolved))

  // 类型不安全的事件监听通过 any 绕过，运行时由 cordis 校验
  const anyCtx = ctx as unknown as { on: (event: string, handler: (...args: unknown[]) => unknown) => void }

  anyCtx.on('skills/change', (..._args: unknown[]) => {
    ctx.logger.debug('[ponytail] 技能目录已变更')
  })

  // Always-on 注入：systemPrompt section，order 50 位于 persona(0) 之后
  const systemPrompt = (ctx as unknown as { systemPrompt: { section: (section: { name: string; order: number; text: string | (() => string) }) => () => void } }).systemPrompt
  systemPrompt.section({
    name: 'ponytail',
    order: 50,
    text: () => {
      // 文件优先：每次注入前拉齐 flag 与内存（外部改 flag 在此收敛）
      try {
        state.syncFromFile()
      } catch {
        // ignore
      }
      const mode = state.get()
      if (!mode || mode === 'off') return ''
      if (mode === 'review') {
        return 'PONYTAIL 已激活 — 等级：review，行为由 /ponytail-review 技能定义。'
      }
      try {
        const raw = readFileSync(mainSkillPath, 'utf8')
        return 'PONYTAIL 已激活 — 等级：' + mode + '\n\n' + filterSkillBodyForMode(raw, mode)
      } catch {
        return getFallbackInstructions(mode)
      }
    },
  })

  // 从单条 content 提取纯文本（B4 公共函数，供 pre-step 与 session/event 复用）
  function extractTextFromContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return (content as Array<Record<string, unknown>>)
        .filter((b) => b && typeof b['text'] === 'string')
        .map((b) => b['text'] as string)
        .join('\n')
    }
    return ''
  }

  // 从 UserMessage.content 提取纯文本（pre-step 合并 messages[]）
  function extractText(messages: Array<{ content: unknown }>): string {
    const parts: string[] = []
    for (const m of messages) {
      const text = extractTextFromContent((m as { content: unknown }).content)
      if (text) parts.push(text)
    }
    return parts.join('\n').trim()
  }

  function handlePromptText(rawText: string): { handled: boolean; switched: boolean } {
    const result = parsePonytailCommand(rawText, state.get(), () => getDefaultMode())
    if (!result.handled) return { handled: false, switched: false }

    // 副作用：等级切换 / 默认持久化 / 报告 / 全句失活（未知参数已由 parse 层按上游 else 兜底切默认）
    if (result.deactivate) {
      state.set(null)
      ctx.logger.info('[ponytail] 已通过指令退出：' + String(rawText ?? '').trim())
      return { handled: true, switched: true }
    }
    if (result.persistDefault) {
      const mode = result.persistDefault.mode
      if (mode === 'off' || mode === 'lite' || mode === 'full' || mode === 'ultra') {
        const written = writeDefaultMode(mode)
        ctx.logger.info(`[ponytail] 默认等级已持久化：${written}`)
        state.set(mode)
      }
      return { handled: true, switched: false }
    }
    if (result.reportOnly) {
      ctx.logger.info(`[ponytail] 当前等级：${result.mode}`)
      return { handled: true, switched: false }
    }
    if (result.mode && result.mode !== 'off') {
      state.set(result.mode)
      ctx.logger.info(`[ponytail] 已切换 — 等级：${result.mode}`)
      return { handled: true, switched: true }
    }
    if (result.mode === 'off') {
      state.set(null)
      ctx.logger.info('[ponytail] 已关闭')
      return { handled: true, switched: true }
    }
    return { handled: true, switched: false }
  }

  // 监听 agent/pre-step waterfall：模型请求前的最后拦截点（对齐上游 UserPromptSubmit）
  // 必须 return next()，否则短路下游
  anyCtx.on(
    'agent/pre-step',
    async (...args: unknown[]) => {
      const [payload, next] = args as [{ messages: Array<{ content: unknown }>; agent: unknown }, () => Promise<unknown>]
      try {
        const text = extractText(payload.messages as Array<{ content: unknown }>)
        if (text) handlePromptText(text)
      } catch {
        // best-effort，不阻断
      }
      return (await next()) as unknown as Awaited<ReturnType<typeof next>>
    },
  )

  // 同时监听 session/event 的 user/message，覆盖 inject 等非 pre-step 路径
  // defensive-patterns：坏订阅者不得断链核心生命周期，整体 try/catch 不抛出
  anyCtx.on('session/event', (...args: unknown[]) => {
    try {
      const [_session, event] = args as [unknown, { type: string; data: unknown }]
      if (event.type !== 'user/message') return
      const text = extractTextFromContent((event.data as { content?: unknown })?.content)
      if (text) handlePromptText(text)
    } catch (err: unknown) {
      ctx.logger.warn(`[ponytail] session/event 处理失败：${String(err)}`)
    }
  })

  // 子 agent 注入：对齐 ponytail-subagent.js 的 PONYTAIL_SUBAGENT_MATCHER
  const subagentMatcherEnv = process.env['PONYTAIL_SUBAGENT_MATCHER']
  let subagentRe: RegExp | null = null
  if (subagentMatcherEnv) {
    try {
      subagentRe = new RegExp(subagentMatcherEnv, 'i')
    } catch {
      subagentRe = null
      ctx.logger.warn(`[ponytail] PONYTAIL_SUBAGENT_MATCHER 正则无效：${subagentMatcherEnv}`)
    }
  }

  // agent/created 双职责：子智能体日志 + 会话启动对齐（补位已下线的事件）
  // 官方 payload 签名 { agent: Agent; source: SessionStartSource; signal?: AbortSignal }（dsh-agent runtime-types 已核实），
  // source 仅 startup|resume 触发对齐，clear|compact 不动作；本监听整体包 try/catch（agent/created 为 serial 模式，坏监听器会失败整个 agent 创建）
  anyCtx.on('agent/created', (...args: unknown[]) => {
    try {
      const [payload] = args as [{ agent: { id: unknown }; source: string }]
      if (subagentRe) {
        ctx.logger.debug(
          `[ponytail] 子智能体已创建：${String(payload.agent.id)} — 匹配器：${subagentMatcherEnv}`,
        )
      }
      if (payload.source === 'startup' || payload.source === 'resume') {
        // 与原语义逐位对齐：currentMode 为 null 或 'off' 都 clearMode（删 flag），正常等级才 setMode
        const mode = state.get()
        state.set(mode === 'off' ? null : mode)
        ctx.logger.debug(`[ponytail] 会话启动（${payload.source}）— 等级：${mode}`)
      }
    } catch (err: unknown) {
      ctx.logger.warn(`[ponytail] agent/created 处理失败：${String(err)}`)
    }
  })

  // 清理：HMR 卸载时自动通过 ctx 逆序清理所有注册；额外标记
  ctx.effect(() => {
    return () => {
      ctx.logger.info('[ponytail] 已卸载 — provider 与 prompt 段已移除')
    }
  })
}

export default { name, inject, Config, apply }
