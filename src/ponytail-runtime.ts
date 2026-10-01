/**
 * ponytail-runtime — DSH 单一宿主 flag 存取
 *
 * 本插件仅面向 DeepSeek Harness（DSH）运行，不识别也不兼容
 * Copilot / Codex / Qoder / Claude Code 等外部宿主（见 docs/adr/0004）。
 * flag 文件（.ponytail-active）固定持久化于 DSH 配置目录，
 * 与 config.json 同源，/ponytail 切换在 DSH 内闭环。
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getConfigDir } from './ponytail-config.js'

const STATE_FILE = '.ponytail-active'

function resolveStateDir(): string {
  return getConfigDir()
}

function statePath(): string {
  return join(resolveStateDir(), STATE_FILE)
}

export function setMode(mode: string): void {
  const p = statePath()
  mkdirSync(dirname(p), { recursive: true })
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
