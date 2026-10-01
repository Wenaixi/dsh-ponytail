/**
 * ponytail-skills — SkillProvider 深模块
 *
 * 把 frontmatter 解析（parseFrontmatter/findClosingFrontmatter/parseInvocationPolicy/
 * frontmatterBoolean/readString/readObject/readMetadata/rejectLegacyKey/isSkillName）、
 * 目录扫描（readdir/stat/readFile，全程透传 AbortSignal）与 SkillProvider 的
 * list/get 两个方法整体收拢在模块内部；ponytail.ts 只保留 Cordis 生命周期与
 * 事件监听，注册处一行构造调用。
 *
 * 边界：skillDir 由 entry 解析后传入（config.skillDir 的优先级归 entry 模块）。
 * 与 @deepseek-ai/dsh-skill 的关系：实现其 SkillProvider 接口；
 * 字段以该包 lib/types/index.d.ts 的生成类型为准。
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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
// SkillProvider（完整复刻上游 6 skill 的 discovery）
// ---------------------------------------------------------------------------

export class PonytailProvider implements SkillProvider {
  readonly name: string
  private readonly skillDir: string
  private readonly ctx: Context

  constructor(
    ctx: Context,
    _control: SkillProviderControl,
    options: { providerName?: string; skillDir: string },
  ) {
    this.ctx = ctx
    this.name = options.providerName ?? 'ponytail'
    this.skillDir = options.skillDir
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
