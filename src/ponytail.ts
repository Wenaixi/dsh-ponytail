/**
 * dsh-ponytail — 面向 DSH 的 Ponytail 适配实现（上游参考版本独立记录于 README）
 *
 * 能力全集：
 * - always-on 梯子注入（systemPrompt section，随 mode 动态裁剪）
 * - 6 个 skill：ponytail / ponytail-review / ponytail-audit / ponytail-debt / ponytail-gain / ponytail-help
 * - 对应 DSH 生命周期接线：activate / mode-tracker / subagent / config / instructions / runtime
 * - 不注册任何 tool，全部能力经 Skill 暴露
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {
  SkillProvider,
  SkillProviderControl,
} from '@deepseek-ai/dsh-skill'
import Schema from '@deepseek-ai/schemastery'

import {
  isShellSafe,
  normalizeMode,
  readConfigFileText,
  writeDefaultMode,
  type PonytailConfig,
} from './ponytail-config.js'
import { resolvePriority } from './ponytail-priority.js'
import { createConfigHttpEndpoint } from './ponytail-http.js'
import { createCommandDispatcher } from './ponytail-commands.js'
import { renderPromptSection } from './ponytail-instructions.js'
import { createPonytailState } from './ponytail-state.js'
import { PonytailProvider } from './ponytail-skills.js'

// ---------------------------------------------------------------------------
// Config — 遵循 references/config.md：Schemastery + 默认值进 schema
// ---------------------------------------------------------------------------

export type Config = PonytailConfig

export const Config: Schema<Config> = Schema.object({
  providerName: Schema.string().default('ponytail'),
  skillDir: Schema.string(),
  // 注意：不给 defaultMode 设 Schema 默认值——Cordis 校验会把缺省 fill 成显式配置，
  // 从而 shadow 掉 config.json 的 defaultMode 档；缺省时由 apply 走
  // resolvePriority()（env > patch > config 文件 > full，见 ponytail-priority.ts）
  defaultMode: Schema.union(['off', 'lite', 'full', 'ultra']),
})

// ---------------------------------------------------------------------------
// 插件元信息
// ---------------------------------------------------------------------------

export const name = 'ponytail'
export const inject = ['skills', 'systemPrompt', 'webServer'] as const

// ---------------------------------------------------------------------------
// 工具函数（与 superpowers 同款健壮版）
// ---------------------------------------------------------------------------

function resolveDefaultSkillDir(configSkillDir?: string): string {
  if (configSkillDir) return resolve(configSkillDir)
  try {
    return fileURLToPath(new URL('../skills', import.meta.url))
  } catch {
    return resolve('skills')
  }
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

export function apply(ctx: Context, config: Config = {} as Config): void {
  let providerInstance: PonytailProvider | null = null
  
  const rawConfig = config as Record<string, unknown>
  const resolved: Config = {
    providerName: (rawConfig['providerName'] as string | undefined) ?? 'ponytail',
    ...(rawConfig['skillDir'] !== undefined ? { skillDir: rawConfig['skillDir'] as string } : {}),
  }

  // 优先级唯一真源（ADR-0006）：apply 启动判定与 UI 诊断链共用 resolvePriority，
  // env > patch（cordis 显式声明）> config.json > full，逐级 normalizeMode 归一。
  // 旧判定把未归一的 patch 值直接 state.set()（大小写/非法值注入垃圾态），此处一并修复。
  const envRaw = process.env['PONYTAIL_DEFAULT_MODE']
  if (envRaw && !normalizeMode(envRaw)) {
    // ponytail: env 非法值静默回退与上游一致，此处 warn 为 DSH 差分（不改变回退语义），便于定位配置错误
    ctx.logger.warn(`[ponytail] PONYTAIL_DEFAULT_MODE 值无效（回退后续来源）：${envRaw}`)
  }
  let patchMode = rawConfig['defaultMode'] as string | undefined
  // 读取 config.json 的 defaultMode 原始值：区分「字段缺失」与「文件损坏」交给诊断链统一标注
  // （initialMode 判定与 HTTP 诊断链共用同一份，必须先于 initialMode 定义）
  const readRawConfigMode = (): string | undefined => {
    try {
      const raw = readConfigFileText()
      if (raw === null) return undefined
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const dm = parsed['defaultMode']
      return typeof dm === 'string' ? dm : undefined
    } catch {
      return undefined
    }
  }
  const initialMode = resolvePriority({
    envRaw,
    patchMode,
    configMode: readRawConfigMode(),
  }).effective

  const skillDir = resolveDefaultSkillDir(resolved.skillDir)

  // 官方设置通道：注册 ponytail 命名空间（与官方 shell、dsh-context 同款），插件页据此 serve 配置表单。
  // 用 ctx.inject 动态探测而非写进 inject 数组——桌面版未装配 settings 服务时静默降级，不影响其余能力。
  // 守卫与 webServer 同款：ctx.inject 缺失（精简宿主或 mock）时整段跳过，不阻断插件其余能力。
  if (typeof (ctx as unknown as { inject?: unknown }).inject === 'function') {
    ctx.inject(['settings'], (sctx) => {
      const service = (sctx as unknown as {
        settings?: { register?: (ns: string, schema: unknown) => void; get?: (ns: string) => unknown }
      }).settings
      if (typeof service?.register !== 'function') return
      service.register('ponytail', Config)
      // 真源仍在 config.json（ADR-0005）：设置表单写入的档位在启动时对齐回来，
      // 否则会出现「界面上改了、运行却不生效」的静默失效。
      // ponytail: 仅启动时对齐一次，无实时订阅；需要即时生效时改挂 settings 的变更回调
      if (typeof service.get === 'function') {
        const stored = service.get('ponytail') as { defaultMode?: string } | null | undefined
        const mode = stored?.defaultMode ? normalizeMode(stored.defaultMode) : null
        if (mode && mode !== readRawConfigMode()) {
          writeDefaultMode(mode)
          ctx.logger.info(`[ponytail] 设置命名空间的默认档已对齐到 config.json：${mode}`)
        }
      }
      ctx.logger.info('[ponytail] 设置命名空间已注册: ponytail')
    })
  }

  // 等级状态唯一归属：get()/set()/syncFromFile() 三方法，闭包态随 HMR 重建
  const state = createPonytailState()
  // 会话启动对齐（对齐上游 ponytail-activate.js SessionStart 语义）：
  // 每次会话启动都按 resolvePriority()（env > patch > config 文件 > full）重写 flag，
  // 因此 /ponytail <档> 只在本会话生效，跨会话持久化必须用 /ponytail default <档>。
  state.set(initialMode === 'off' ? null : initialMode)

  if (state.get()) {
    ctx.logger.info(`[ponytail] 已激活 — 等级：${state.get()}（skillDir: ${skillDir}）`)
  } else {
    ctx.logger.info('[ponytail] 已关闭 — 直到 /ponytail 再次激活前不注入')
  }

  if (skillDir && !isShellSafe(skillDir)) {
    ctx.logger.warn(`[ponytail] skillDir 包含 shell 元字符，请检查路径：${skillDir}`)
  }

  // SkillProvider 注册：深模块构造函数接收已解析的 providerName 与 skillDir（优先级归 entry）
  const skills = (ctx as unknown as { skills: { registerProvider: (factory: (control: SkillProviderControl) => SkillProvider) => () => void } }).skills
  skills.registerProvider((control) => {
    providerInstance = new PonytailProvider(ctx, control, {
      providerName: resolved.providerName ?? 'ponytail',
      skillDir,
      // 物理隐藏接线（评审 Important #1 修复）：UI 禁用技能 → state 内存集 → provider.list/get
      // 同步过滤。此前从未传入，UI 改开关对模型侧目录无效（静默失效，跨会话仍放行）。
      // 失效闭环：POST 变更点直调 invalidateSkills() → providerInstance.invalidate() → 宿主重扫。
      isSkillEnabled: (name) => state.isSkillEnabled(name),
    })
    return providerInstance
  })

  // 类型不安全的事件监听通过 any 绕过，运行时由 cordis 校验
  const anyCtx = ctx as unknown as { on: (event: string, handler: (...args: unknown[]) => unknown) => void }

  // ponytail: skills/change 只保留 debug——官方语义是给消费方（host UI/agent-loop）的
  // 通知缝，提供者不应在其内反向调 control.invalidate()（invalidateCache→notifyChange
  // 会再次 emit 同事件，同步广播无防重入守卫，直接栈溢出）。本插件技能目录变更由
  // UI 变更点直调 invalidateSkills() 收敛（C1 修活 providerInstance 后生效）。
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
        state.reloadDisabledSkills()
      } catch {
        // ignore
      }
      return renderPromptSection(skillDir, state)
    },
  })

  // 命令调度器深模块：收敛文本提取、指令语法解析、状态机流转与宿主日志
  const dispatcher = createCommandDispatcher({
    state,
    logger: ctx.logger,
    // 默认档唯一真源（ADR-0007 修订 ADR-0006）：命令层的「兜底切默认档」与 apply 启动判定、
    // UI 面板 defaultMode 共用 resolvePriority().effective（env > patch > config > full）。
    // 修复前未注入此闭包 → 落到 ponytail-config.getDefaultMode()（无 patch 层），
    // 当 cordis.patch.yml 显式声明 defaultMode 时，/ponytail foobar 会把等级从 patch 档切到 config 档（静默不一致）。
    // 必须传实时闭包而非快照：/ponytail default <档> 写盘后，下一次命令解析要读到新值。
    getDefaultMode: () =>
      resolvePriority({
        envRaw,
        patchMode,
        configMode: readRawConfigMode(),
      }).effective,
    // /ponytail default <档> 写盘后更新 patchMode：用户最新意图覆盖宿主声明，
    // UI 快照与命令兜底同刻读新值（修复评审发现的静默 ignore）
    updateDefaultMode: (mode) => {
      patchMode = mode
    },
    writeDefaultMode,
  })

  // 监听 agent/pre-step waterfall：模型请求前的最后拦截点（对齐上游 UserPromptSubmit）
  // 必须 return next()，否则短路下游
  anyCtx.on(
    'agent/pre-step',
    async (...args: unknown[]) => {
      const [payload, next] = args as [{ messages?: unknown; agent?: unknown }, () => Promise<unknown>]
      try {
        dispatcher.dispatchMessages(payload?.messages)
      } catch (err: unknown) {
        // best-effort：与 session/event 同一防御策略，失败可见（坏订阅者不断链）
        ctx.logger.warn(`[ponytail] agent/pre-step 处理失败（仍会调用 next()，不拦截请求）：${String(err)}`)
      }
      return (await next()) as unknown as Awaited<ReturnType<typeof next>>
    },
  )

  // 同时监听 session/event 的 user/message，覆盖 inject 等非 pre-step 路径
  // defensive-patterns：坏订阅者不得断链核心生命周期，整体 try/catch 不抛出
  anyCtx.on('session/event', (...args: unknown[]) => {
    try {
      const [_session, event] = args as [unknown, { type: string; data?: { content?: unknown } }]
      if (event?.type !== 'user/message') return
      dispatcher.dispatchContent(event.data?.content)
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
        // 会话启动镜像 flag：set() 已归一 off→null，无需再镜像
        state.syncToFile()
        ctx.logger.debug(`[ponytail] 会话启动（${payload.source}）— 镜像 flag 等级：${state.get()}`)
      }
    } catch (err: unknown) {
      ctx.logger.warn(`[ponytail] agent/created 处理失败：${String(err)}`)
    }
  })


  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Web 配置端点：独立深工厂（src/ponytail-http.ts），apply 只保留接线
  // invalidateSkills 依赖 providerInstance（上方注册时已捕获实例，C1 修复）
  if ((ctx as any).webServer) {
    ctx.effect(() => {
      ctx.logger.info('[ponytail] Web 配置端点已就绪: /api/plugins/ponytail/config')
      return (ctx as any).webServer.register({
        kind: 'exact',
        path: '/api/plugins/ponytail/config',
        handler: createConfigHttpEndpoint({
          state,
          readRawConfigMode,
          invalidateSkills: () => {
            if (providerInstance) {
              try {
                providerInstance.invalidate()
              } catch {
                // 忽略异常
              }
            }
          },
          readPatchMode: () => patchMode,
          logger: ctx.logger,
          readEnvRaw: () => process.env['PONYTAIL_DEFAULT_MODE'],
          skillDir,
        }),
      })
    }, 'ponytail: web route')
  }

  // 清理：HMR 卸载时自动通过 ctx 逆序清理所有注册；额外标记
  ctx.effect(() => {
    return () => {
      ctx.logger.info('[ponytail] 已卸载 — provider 与 prompt 段已移除')
    }
  })
}

export default { name, inject, Config, apply }
