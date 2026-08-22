/**
 * ponytail-runtime — 移植自 hooks/ponytail-runtime.js
 *
 * flag 文件 + 多平台环境识别。
 * DSH 侧以文件为真源，保持与 Claude/Codex/Qoder 共存语义；
 * HMR 卸载时不残留句柄。
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import path from 'node:path'
import { getClaudeDir } from './ponytail-config.js'

const STATE_FILE = '.ponytail-active'

function isVsCodeCopilotRoot(pluginRoot: string | undefined): boolean {
  if (!pluginRoot) return false
  return pluginRoot.split(/[\\/]+/).includes('agent-plugins') && pluginRoot.toLowerCase().includes('.vscode')
}

export function isCopilot(): boolean {
  return Boolean(process.env['COPILOT_PLUGIN_DATA']) || isVsCodeCopilotRoot(process.env['CLAUDE_PLUGIN_ROOT'])
}

export function isCodex(): boolean {
  return !isCopilot() && Boolean(process.env['PLUGIN_DATA'])
}

export function isQoder(): boolean {
  return !isCopilot() && !isCodex() && Boolean(process.env['QODER_SESSION_ID'])
}

function resolveStateDir(): string {
  let dir = getClaudeDir()
  if (isCodex()) dir = process.env['PLUGIN_DATA']!
  if (isCopilot()) dir = process.env['COPILOT_PLUGIN_DATA'] ?? getClaudeDir()
  if (isQoder()) dir = path.join(os.homedir(), '.qoder')
  return dir
}

function statePath(): string {
  return path.join(resolveStateDir(), STATE_FILE)
}

export function setMode(mode: string): void {
  const p = statePath()
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, mode, 'utf8')
}

export function clearMode(): void {
  try {
    unlinkSync(statePath())
  } catch {
    // ignore
  }
}

export function readMode(): string | null {
  try {
    const v = readFileSync(statePath(), 'utf8').trim()
    return v || null
  } catch {
    return null
  }
}

// DSH 侧不走 stdout JSON，改为无操作兼容层；真实注入由 systemPrompt + agent 事件完成
export function writeHookOutput(_event: string, _mode: string, _context = ''): void {
  // no-op in DSH — kept for upstream parity
}

export function getStatePath(): string {
  return statePath()
}
