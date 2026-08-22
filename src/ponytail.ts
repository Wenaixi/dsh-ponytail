/**
 * dsh-ponytail — DSH 完整移植版 ponytail (dietrichgebert/ponytail 4.9.0)
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
} from '@deepseek-ai/dsh-skill'
import Schema from '@deepseek-ai/schemastery'

import {
  DEFAULT_MODE,
  getDefaultMode,
  isDeactivationCommand,
  isShellSafe,
  normalizeMode,
  writeDefaultMode,
} from './ponytail-config.js'
import { filterSkillBodyForMode, getFallbackInstructions, getMainSkillPath } from './ponytail-instructions.js'
import { clearMode, isCopilot, readMode, setMode } from './ponytail-runtime.js'

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
  hideStatus?: boolean
  quietStartup?: boolean
}

export const Config: Schema<Config> = Schema.object({
  providerName: Schema.string().default('ponytail'),
  skillDir: Schema.string(),
  defaultMode: Schema.union(['off', 'lite', 'full', 'ultra']).default('full'),
  hideStatus: Schema.boolean().default(false),
  quietStartup: Schema.boolean().default(false),
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

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function optionalString(data: Record<string, unknown>, key: string): Record<string, string> {
  const v = data[key]
  return typeof v === 'string' && v.length > 0 ? { [key]: v } : {}
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

function optionalMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const v = data['metadata']
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) return { metadata: v as Record<string, unknown> }
  return {}
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

  async list(_options: SkillLookupOptions): Promise<readonly SkillCandidate[]> {
    const candidates: SkillCandidate[] = []
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(this.skillDir, { withFileTypes: true })
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        this.ctx.logger.warn(`[ponytail] 未找到 skill 目录：${this.skillDir}`)
        return []
      }
      throw err
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue
      const skillPath = join(this.skillDir, entry.name, 'SKILL.md')
      try {
        await stat(skillPath)
      } catch {
        continue
      }
      const parsed = await parseSkillFile(skillPath)
      if (!parsed) {
        this.ctx.logger.warn(`[ponytail] 跳过 ${entry.name}：缺少或无效的 frontmatter`)
        continue
      }
      const { data, body } = parsed
      const skillName = stringField(data, 'name')
      const description = stringField(data, 'description')
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
        ...optionalString(data, 'whenToUse'),
        invocation,
        source: 'bundled',
        provider: this.name,
        rank: PONYTAIL_RANK,
        locator: { path: skillPath, directory: dirname(skillPath) },
        resourceBase: { kind: 'directory', path: dirname(skillPath) },
        path: skillPath,
        ...optionalMetadata(data),
      } as SkillCandidate)
      void body
    }

    return candidates
  }

  async get(candidate: SkillCandidate, _options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as { path: string; directory: string }
    const raw = await readFile(locator.path, 'utf8').catch(() => undefined)
    if (raw === undefined) return undefined
    const parsed = parseFrontmatter(raw)
    if (!parsed) return undefined
    const data = parsed.data
    const skillName = stringField(data, 'name')
    const description = stringField(data, 'description')
    if (!skillName || !description) return undefined
    if (skillName !== candidate.name) return undefined
    let invocation: { modelInvocable: boolean; userInvocable: boolean }
    try {
      invocation = parseInvocationPolicy(data)
    } catch {
      return undefined
    }
    return {
      name: skillName,
      description,
      ...optionalString(data, 'whenToUse'),
      invocation,
      source: 'bundled',
      provider: this.name,
      resourceBase: { kind: 'directory', path: locator.directory },
      path: locator.path,
      ...optionalMetadata(data),
      content: parsed.body.trim(),
    }
  }
}

async function parseSkillFile(
  path: string,
): Promise<{ data: Record<string, unknown>; body: string } | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
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
    defaultMode: (rawConfig['defaultMode'] as Config['defaultMode']) ?? 'full',
    hideStatus: (rawConfig['hideStatus'] as boolean | undefined) ?? false,
    quietStartup: (rawConfig['quietStartup'] as boolean | undefined) ?? false,
  }

  // 优先级：PONYTAIL_DEFAULT_MODE env > cordis config 的 defaultMode（显式）> 配置文件 > full
  // 与上游 ponytail-config.js 的 getDefaultMode(env > file > full) 保持一致，
  // 但 cordis 显式配置应夹在 env 与 file 之间
  const envRaw = process.env['PONYTAIL_DEFAULT_MODE']
  const envMode = envRaw ? normalizeMode(envRaw) : null
  let initialMode: string | null
  if (envMode) {
    initialMode = envMode
  } else if (rawConfig['defaultMode'] !== undefined) {
    initialMode = resolved.defaultMode ?? null
  } else {
    initialMode = getDefaultMode()
  }

  const skillDir = resolveDefaultSkillDir(resolved.skillDir)
  const mainSkillPath = getMainSkillPath(skillDir)

  let currentMode: string | null = initialMode === 'off' ? null : initialMode

  if (currentMode && currentMode !== 'off') {
    try {
      setMode(currentMode)
    } catch {
      // best-effort
    }
    ctx.logger.info(`[ponytail] 已激活 — 等级：${currentMode}（skillDir: ${skillDir}）`)
  } else {
    try {
      clearMode()
    } catch {
      // best-effort
    }
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
      try {
        const fileMode = readMode()
        if (fileMode !== null && fileMode !== currentMode) {
          const nm = normalizeMode(fileMode) ?? (fileMode === 'review' ? 'review' : null)
          if (nm !== null || fileMode === 'review') currentMode = fileMode
          else if (fileMode === 'off') currentMode = null
        } else if (fileMode === null && currentMode !== null) {
          if (!isCopilot()) currentMode = null
        }
      } catch {
        // ignore
      }
      if (!currentMode || currentMode === 'off') return ''
      if (currentMode === 'review') {
        return 'PONYTAIL 已激活 — 等级：review，行为由 /ponytail-review 技能定义。'
      }
      try {
        const raw = readFileSync(mainSkillPath, 'utf8')
        return 'PONYTAIL 已激活 — 等级：' + currentMode + '\n\n' + filterSkillBodyForMode(raw, currentMode)
      } catch {
        return getFallbackInstructions(currentMode)
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
    const text = String(rawText ?? '').trim()
    const lower = text.toLowerCase()

    if (/^[/@$]ponytail/.test(lower)) {
      const parts = lower.split(/\s+/)
      const cmd = (parts[0] ?? '').replace(/^[@$]/, '/')
      const arg = parts[1] ?? ''
      const arg2 = parts[2] ?? ''

      let mode: string | null = null
      let isReportOnly = false
      let isDefaultPersist = false
      let persistMode: string | null = null

      if (cmd === '/ponytail-review' || cmd === '/ponytail:ponytail-review') {
        mode = 'review'
      } else if (cmd === '/ponytail' || cmd === '/ponytail:ponytail') {
        if (arg === 'default') {
          isDefaultPersist = true
          persistMode = arg2
        } else if (arg === 'lite') mode = 'lite'
        else if (arg === 'full') mode = 'full'
        else if (arg === 'ultra') mode = 'ultra'
        else if (arg === 'off') mode = 'off'
        else if (arg === '') {
          isReportOnly = true
          mode = currentMode ?? getDefaultMode()
        } else { ctx.logger.warn('[ponytail] 未知参数: ' + arg); return { handled: true, switched: false } }
      }

      if (isDefaultPersist) {
        if (persistMode === 'off' || persistMode === 'lite' || persistMode === 'full' || persistMode === 'ultra') {
          const written = writeDefaultMode(persistMode)
          ctx.logger.info(`[ponytail] 默认等级已持久化：${written}`)
          currentMode = persistMode
          try {
            setMode(persistMode)
          } catch {}
        }
        return { handled: true, switched: false }
      }

      if (isReportOnly) {
        ctx.logger.info(`[ponytail] 当前等级：${mode}`)
        return { handled: true, switched: false }
      }

      if (mode && mode !== 'off') {
        currentMode = mode
        try {
          setMode(mode)
        } catch {}
        ctx.logger.info(`[ponytail] 已切换 — 等级：${mode}`)
        return { handled: true, switched: true }
      }
      if (mode === 'off') {
        currentMode = null
        try {
          clearMode()
        } catch {}
        ctx.logger.info('[ponytail] 已关闭')
        return { handled: true, switched: true }
      }

      return { handled: true, switched: false }
    }

    if (isDeactivationCommand(text)) {
      currentMode = null
      try {
        clearMode()
      } catch {}
      ctx.logger.info('[ponytail] 已通过指令退出：' + text)
      return { handled: true, switched: true }
    }

    return { handled: false, switched: false }
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
  anyCtx.on('session/event', (...args: unknown[]) => {
    const [_session, event] = args as [unknown, { type: string; data: unknown }]
    if (event.type !== 'user/message') return
    try {
      const text = extractTextFromContent((event.data as { content?: unknown })?.content)
      if (text) handlePromptText(text)
    } catch {
      // ignore
    }
  })

  // agent/session-start：对齐 ponytail-activate.js 的 SessionStart 与 Qoder 首轮激活
  anyCtx.on('agent/session-start', (...args: unknown[]) => {
    const [payload] = args as [{ source: string }]
    if (!currentMode || currentMode === 'off') {
      try {
        clearMode()
      } catch {}
      return
    }
    try {
      setMode(currentMode)
    } catch {}
    ctx.logger.debug(`[ponytail] 会话启动（${payload.source}）— 等级：${currentMode}`)
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

  anyCtx.on('agent/created', (...args: unknown[]) => {
    const [payload] = args as [{ agent: { id: unknown } }]
    if (!subagentRe) return
    ctx.logger.debug(`[ponytail] 子智能体已创建：${String((payload.agent as { id: unknown }).id)} — 匹配器：${subagentMatcherEnv}`)
  })

  // 清理：HMR 卸载时自动通过 ctx 逆序清理所有注册；额外标记
  ctx.effect(() => {
    return () => {
      ctx.logger.info('[ponytail] 已卸载 — provider 与 prompt 段已移除')
    }
  })
}

export default { name, inject, Config, apply }
