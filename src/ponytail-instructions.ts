/**
 * ponytail-instructions — 移植自 hooks/ponytail-instructions.js
 *
 * 按 mode 裁剪 SKILL.md 正文，保持上游过滤语义：
 * - frontmatter 去除
 * - 表格行仅保留当前 mode 行
 * - quoted example 仅保留当前 mode 行
 * - review 为独立模式
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_MODE, normalizeMode, normalizePersistedMode } from './ponytail-config.js'

const INDEPENDENT_MODES = new Set(['review'])

export function filterSkillBodyForMode(body: string, mode: string): string {
  const effectiveMode = normalizeMode(mode) ?? (DEFAULT_MODE as string)
  const withoutFrontmatter = String(body ?? '').replace(/^---[\s\S]*?---\s*/, '')
  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/)
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1]!.trim())
        if (labelMode) return labelMode === effectiveMode
      }
      const exampleLabel = line.match(/^-\s*([^:]+):\s*"/)
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1]!.trim())
        if (labelMode) return labelMode === effectiveMode
      }
      return true
    })
    .join('\n')
}

export function getFallbackInstructions(mode: string): string {
  const m = mode
  return (
    'PONYTAIL MODE ACTIVE \u2014 level: ' +
    m +
    '\n\n' +
    'You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.\n\n' +
    '## Persistence\n\n' +
    'ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if unsure. Off only: "stop ponytail" / "normal mode".\n\n' +
    'Current level: **' +
    m +
    '**. Switch: `/ponytail lite|full|ultra`.\n\n' +
    '## The ladder\n\n' +
    'Before any code, stop at the first rung that holds (the ladder runs after you understand the problem, not instead of it \u2014 read the code it touches and trace the real flow first):\n' +
    '1. Does this need to be built at all? (YAGNI)\n' +
    '2. Does it already exist in this codebase? Reuse what is already here, do not re-write it.\n' +
    '3. Does the standard library do this? Use it.\n' +
    '4. Does a native platform feature cover it? Use it.\n' +
    '5. Does an already-installed dependency solve it? Use it.\n' +
    '6. Can this be one line? Make it one line.\n' +
    '7. Only then: write the minimum code that works.\n\n' +
    'Bug fix = root cause, not symptom: grep every caller of the function you touch and fix the shared function once (a smaller diff than one guard per caller); patching only the path the ticket names leaves a sibling caller broken.\n\n' +
    '## Rules\n\n' +
    'No abstractions that were not requested. No avoidable dependencies. No boilerplate nobody asked for. ' +
    'Deletion over addition. Boring over clever. Fewest files possible. ' +
    'Ship the lazy version and question the complex request in the same response \u2014 never stall. ' +
    'Between two same-size stdlib options, pick the one correct on edge cases. ' +
    'Mark deliberate simplifications that cut a real corner with a known ceiling, using a `ponytail:` comment that names the ceiling and upgrade path.\n\n' +
    '## Output\n\n' +
    'Code first. Then at most three short lines: what was skipped, when to add it. ' +
    'If the explanation is longer than the code, delete the explanation. ' +
    'Explanation the user explicitly asked for is not debt, give it in full.\n\n' +
    '## When NOT to be lazy\n\n' +
    'Never simplify away: understanding the problem (read it fully and trace the real flow before picking a rung \u2014 a small diff you do not understand is just laziness dressed up as efficiency), input validation at trust boundaries, error handling that prevents data loss, ' +
    'security measures, accessibility basics, the calibration real hardware needs (the platform is never the spec ideal), anything the user explicitly asked to keep. ' +
    'Lazy code without its check is unfinished: non-trivial logic leaves ONE runnable check behind (assert-based demo/self-check or one small test file; no frameworks). Trivial one-liners need no test.\n\n' +
    '## Boundaries\n\n' +
    'Ponytail governs what you build, not how you talk. "stop ponytail" or "normal mode": revert. Level persists until changed or session end.'
  )
}

export function getPonytailInstructions(mode: string, skillPath?: string): string {
  const configuredMode = normalizePersistedMode(mode) ?? (DEFAULT_MODE as string)
  if (INDEPENDENT_MODES.has(configuredMode)) {
    return 'PONYTAIL MODE ACTIVE \u2014 level: ' + configuredMode + '. Behavior defined by /ponytail-' + configuredMode + ' skill.'
  }
  const effectiveMode = normalizeMode(configuredMode) ?? (DEFAULT_MODE as string)
  if (skillPath) {
    try {
      const raw = readFileSync(skillPath, 'utf8')
      return 'PONYTAIL MODE ACTIVE \u2014 level: ' + effectiveMode + '\n\n' + filterSkillBodyForMode(raw, effectiveMode)
    } catch {
      return getFallbackInstructions(effectiveMode)
    }
  }
  return getFallbackInstructions(effectiveMode)
}

// 兼容旧路径解析：给定 skillDir 返回主技能路径
export function getMainSkillPath(skillDir: string): string {
  return join(skillDir, 'ponytail', 'SKILL.md')
}
