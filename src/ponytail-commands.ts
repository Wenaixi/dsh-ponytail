import type { PonytailState } from './ponytail-state.js'
import {
  getDefaultMode,
  writeDefaultMode,
  type RuntimeMode,
} from './ponytail-config.js'

/**
 * 仅当整句为该命令时失活，避免 "add a normal mode toggle" 误触发
 * 中英文全句匹配：英文 stop ponytail / normal mode，中文 退出 ponytail / 正常模式
 * 清洗尾部中英文标点与空白符
 */
export function isDeactivationCommand(text: string): boolean {
  const t = String(text ?? '').trim().toLowerCase().replace(/[.!?\s。！？]+$/, '')
  return t === 'stop ponytail' || t === 'normal mode' || t === '退出 ponytail' || t === '正常模式'
}

/**
 * 指令解析结果（底层纯数据结构，供单元测试与内部调度使用）
 */
export interface CommandParseResult {
  handled: boolean
  switched: boolean
  mode?: RuntimeMode | 'review'
  deactivate?: boolean
  reportOnly?: boolean
  persistDefault?: { mode: string } | null
}

/**
 * 从单条消息 content 结构中提取纯文本
 */
export function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { text: string } => typeof (b as { text?: unknown })?.text === 'string')
      .map((b) => b.text)
      .join('\n')
  }
  return ''
}

/**
 * 从消息数组中提取并拼接纯文本
 */
export function extractText(messages: unknown): string {
  if (!Array.isArray(messages)) return ''
  return messages
    .map((m) => extractTextFromContent((m as { content?: unknown })?.content))
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * 解析用户输入的文本是否为 ponytail 命令
 * 移植自 hooks/ponytail-mode-tracker.js 的核心解析逻辑
 */
export function parsePonytailCommand(
  rawText: string,
  currentMode: string | null,
  getDefault: () => RuntimeMode,
): CommandParseResult {
  const text = String(rawText ?? '').trim()
  const lower = text.toLowerCase()

  // 1. 全句失活指令
  if (isDeactivationCommand(lower)) {
    return { handled: true, switched: true, deactivate: true }
  }

  // 2. 指令前缀匹配：统一处理 /、@、$ 以及 :ponytail 前缀
  const match = text.match(/^[/@$](?:ponytail:)?(ponytail(?:-[a-z]+)?)(?:\s+(.*))?$/i)
  if (!match) return { handled: false, switched: false }

  const cmd = match[1].toLowerCase()
  const arg = (match[2] ?? '').trim().toLowerCase()

  if (cmd === 'ponytail-review') {
    return { handled: true, switched: true, mode: 'review' }
  }

  if (cmd === 'ponytail') {
    if (arg === 'off') {
      return { handled: true, switched: true, mode: 'off' }
    }
    if (arg === 'lite' || arg === 'full' || arg === 'ultra') {
      return { handled: true, switched: true, mode: arg }
    }
    if (arg.startsWith('default')) {
      const targetMode = arg.replace(/^default\s*/, '').trim()
      return {
        handled: true,
        switched: false,
        persistDefault: { mode: targetMode },
      }
    }
    if (!arg) {
      // 裸 /ponytail 仅报告当前等级，不切换
      return {
        handled: true,
        switched: false,
        reportOnly: true,
        mode: (currentMode as RuntimeMode | null) ?? getDefault(),
      }
    }
    // 未知参数：对齐上游 mode-tracker 的 else 兜底切默认等级
    return { handled: true, switched: true, mode: getDefault() }
  }

  return { handled: false, switched: false }
}

export interface CommandDispatcherLogger {
  info: (msg: string) => void
  warn?: (msg: string) => void
  debug?: (msg: string) => void
}

export interface CommandDispatcherEnv {
  state: PonytailState
  logger: CommandDispatcherLogger
  getDefaultMode?: () => RuntimeMode
  writeDefaultMode?: (mode: string) => RuntimeMode | null
  /** 写盘成功后同步外部默认档判定源（如 apply 的 patchMode），使命令层/UI 即时反映用户意图 */
  updateDefaultMode?: (mode: RuntimeMode) => void
}

export interface CommandDispatchResult {
  handled: boolean
  switched: boolean
}

export interface CommandDispatcher {
  dispatchText: (rawText: string, sessionId?: string) => CommandDispatchResult
  dispatchContent: (content: unknown, sessionId?: string) => CommandDispatchResult
  dispatchMessages: (messages: unknown, sessionId?: string) => CommandDispatchResult
}

/**
 * 创建高内聚的命令调度器深模块
 * 将文本提取、指令语法解析、状态机流转与副作用执行完整封装
 * 支持可选的 sessionId 会话作用域，实现多会话模式隔离与零缓存破坏调度
 */
export function createCommandDispatcher(env: CommandDispatcherEnv): CommandDispatcher {
  const getDef = env.getDefaultMode ?? getDefaultMode
  const writeDef = env.writeDefaultMode ?? writeDefaultMode

  function dispatchText(rawText: string, sessionId?: string): CommandDispatchResult {
    const text = String(rawText ?? '').trim()
    const currentMode = (sessionId && typeof env.state.getSession === 'function')
      ? env.state.getSession(sessionId).effectiveMode
      : env.state.get()
    const result = parsePonytailCommand(text, currentMode, getDef)
    if (!result.handled) return { handled: false, switched: false }

    if (result.deactivate) {
      if (typeof env.state.setSessionMode === 'function') {
        env.state.setSessionMode(sessionId, null)
      } else {
        env.state.set(null)
      }
      env.logger.info(`[ponytail] 已通过指令退出：${text}`)
      return { handled: true, switched: true }
    }

    if (result.persistDefault) {
      const targetMode = result.persistDefault.mode
      if (targetMode === 'off' || targetMode === 'lite' || targetMode === 'full' || targetMode === 'ultra') {
        const written = writeDef(targetMode)
        env.logger.info(`[ponytail] 默认等级已持久化：${written}`)
        // 用户最新意图即时生效：同步外部判定源（apply 的 patchMode）
        env.updateDefaultMode?.(targetMode)
        // 关键：全局修改配置时，同步更新所有已有会话的 effectiveMode，
        // 但严禁修改已有会话的 baselineMode，确保已有会话在下轮自动通过尾部追加通知生效！
        if (typeof env.state.syncGlobalModeToSessions === 'function') {
          env.state.syncGlobalModeToSessions(targetMode)
        } else {
          env.state.set(targetMode)
        }
      }
      return { handled: true, switched: true }
    }

    // ponytail: 严格内聚时序：reportOnly 必须先于 mode 分支判断，防止裸 /ponytail 误判切档
    if (result.reportOnly) {
      env.logger.info(`[ponytail] 当前等级：${result.mode}`)
      return { handled: true, switched: false }
    }

    if (result.mode && result.mode !== 'off') {
      if (typeof env.state.setSessionMode === 'function') {
        env.state.setSessionMode(sessionId, result.mode)
      } else {
        env.state.set(result.mode)
      }
      env.logger.info(`[ponytail] 已切换 — 等级：${result.mode}`)
      return { handled: true, switched: true }
    }

    if (result.mode === 'off') {
      if (typeof env.state.setSessionMode === 'function') {
        env.state.setSessionMode(sessionId, null)
      } else {
        env.state.set(null)
      }
      env.logger.info('[ponytail] 已关闭')
      return { handled: true, switched: true }
    }

    return { handled: true, switched: false }
  }

  return {
    dispatchText,
    dispatchContent(content: unknown, sessionId?: string): CommandDispatchResult {
      const text = extractTextFromContent(content)
      return text ? dispatchText(text, sessionId) : { handled: false, switched: false }
    },
    dispatchMessages(messages: unknown, sessionId?: string): CommandDispatchResult {
      const text = extractText(messages)
      return text ? dispatchText(text, sessionId) : { handled: false, switched: false }
    },
  }
}
