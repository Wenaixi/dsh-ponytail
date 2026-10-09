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
 * 描述语言由 getDescriptionLang 闭包现读，来源 skills/descriptions.{lang}.json。
 * 与 @deepseek-ai/dsh-skill 的关系：实现其 SkillProvider 接口；
 * 字段以该包 lib/types/index.d.ts 的生成类型为准。
 */

import { readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'

/** 技能描述的语言。与 Config.skillDescriptionLang 同一取值域。 */
export type SkillLang = 'zh' | 'en'

/** 技能 id 列表与描述的唯一真源：skills/descriptions.{lang}.json */
export const SKILL_IDS = ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help'] as const

/**
 * 短描述兜底：描述文件不可读时用（模型目录与面板至少有一行说明，不至于空白）。
 * 完整描述在 skills/descriptions.{lang}.json，不在此重复。
 */
export const FALLBACK_DESCRIPTION: Record<SkillLang, Record<string, string>> = {
  zh: {
    'ponytail': '懒人模式本体：7 阶梯子，lite/full/ultra 三档强度',
    'ponytail-review': '过度设计评审：只挑能删的代码，一行一条',
    'ponytail-audit': '全仓过度设计审计：按可删行数降序猎取臃肿',
    'ponytail-debt': '收割 ponytail: 注释列成债务台账',
    'ponytail-gain': '收益看板：benchmark 中位数实测收益',
    'ponytail-help': '速查卡：模式、技能与命令',
  },
  en: {
    'ponytail': 'Lazy senior dev mode: seven-rung ladder, lite/full/ultra',
    'ponytail-review': 'Over-engineering review: only what can be deleted',
    'ponytail-audit': 'Whole-repo audit for over-engineering, ranked by cut size',
    'ponytail-debt': 'Harvest ponytail: shortcut comments into a debt ledger',
    'ponytail-gain': 'Measured-impact scoreboard from benchmark medians',
    'ponytail-help': 'Quick reference: modes, skills, commands',
  },
}

export interface SkillMeta {
  id: string
  name: string
  description: string
}

/** 读 skills/descriptions.<lang>.json；不可读返回 null 由调用方回退。 */
export function readSkillDescriptions(lang?: SkillLang): Record<string, string> | null {
  try {
    const raw = readFileSync(
      new URL(`../skills/descriptions.${lang === 'en' ? 'en' : 'zh'}.json`, import.meta.url),
      'utf8',
    ).replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const id of SKILL_IDS) {
      const value = parsed[id]
      if (typeof value === 'string' && value.length > 0) out[id] = value
    }
    return Object.keys(out).length === SKILL_IDS.length ? out : null
  } catch {
    return null
  }
}

/**
 * 从包内描述文件读取技能元数据；文件不可读或缺项时回退短描述。
 *
 * lang 缺省或非法一律按 zh 处理：调用方（面板、Provider）读的是配置值，
 * 而配置可能来自手写的补丁，不保证取值域干净。
 */
export function readSkillMeta(lang?: SkillLang): SkillMeta[] {
  const safeLang: SkillLang = lang === 'en' ? 'en' : 'zh'
  const text = readSkillDescriptions(safeLang)
  return SKILL_IDS.map((id) => ({
    id,
    name: id,
    description: text?.[id] ?? FALLBACK_DESCRIPTION[safeLang][id] ?? id,
  }))
}
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
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '').trimEnd() === '---') {
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
  const clean = raw.replace(/^\uFEFF/, '')
  const firstNl = clean.indexOf('\n')
  if (firstNl < 0) return undefined
  if (clean.slice(0, firstNl).replace(/\r$/, '').trimEnd() !== '---') return undefined
  const start = firstNl + 1
  const closing = findClosingFrontmatter(clean, start)
  if (!closing) return undefined
  const parsed = parse(clean.slice(start, closing.start))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  return { data: parsed as Record<string, unknown>, body: clean.slice(closing.bodyStart) }
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
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) throw (signal?.reason ?? err)
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
// SkillProvider：提供 6 个随包发布的 DSH 原生技能
// ---------------------------------------------------------------------------

interface SkillBaseFields {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly invocation: { modelInvocable: boolean; userInvocable: boolean }
  readonly source: 'bundled'
  readonly provider: string
  readonly resourceBase: { readonly kind: 'directory'; readonly path: string }
  readonly path: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

/**
 * 私有组装流水线：从 frontmatter 提取并验证公共基础字段。
 * 校验失败或格式非法时抛出 Error，由外层根据上下文决定记录日志或静默处理。
 *
 * 描述不在这里决定：SKILL.md 的 frontmatter 只保留英文原文（上游真源），
 * 中文描述在 skills/descriptions.zh.json，由 Provider 按配置选择下发哪一套。
 * frontmatter 的 description 因此只作为「文件可解析」的存在性校验与缺项兜底。
 */
function assembleSkillBase(
  data: Record<string, unknown>,
  filePath: string,
  providerName: string,
  description: string,
): SkillBaseFields {
  const name = readString(data, 'name')
  if (!name || !readString(data, 'description')) {
    throw new Error('frontmatter 必须包含 name 和 description')
  }
  if (!isSkillName(name)) {
    throw new Error(`无效的 skill 名称 "${name}"`)
  }
  const whenToUse = readString(data, 'whenToUse')
  const invocation = parseInvocationPolicy(data)
  const baseDir = dirname(filePath)
  return {
    name,
    description,
    ...(whenToUse ? { whenToUse } : {}),
    invocation,
    source: 'bundled',
    provider: providerName,
    resourceBase: { kind: 'directory', path: baseDir },
    path: filePath,
    ...readMetadata(data),
  }
}

export class PonytailProvider implements SkillProvider {
  readonly name: string
  private readonly skillDir: string
  private readonly ctx: Context
  private readonly control: SkillProviderControl
  private readonly isSkillEnabled?: (name: string) => boolean
  /** 当前配置要求的描述语言；每次求值现读 volatile 引用，不缓存 */
  private readonly getDescriptionLang?: () => 'zh' | 'en'

  constructor(
    ctx: Context,
    control: SkillProviderControl,
    options: {
      providerName?: string
      skillDir: string
      isSkillEnabled?: (name: string) => boolean
      getDescriptionLang?: () => 'zh' | 'en'
    },
  ) {
    this.ctx = ctx
    this.control = control
    this.name = options.providerName ?? 'ponytail'
    this.skillDir = options.skillDir
    this.isSkillEnabled = options.isSkillEnabled
    this.getDescriptionLang = options.getDescriptionLang
  }

  /**
   * 当前语言的描述表；描述文件不可读时返回 null，调用方回退 frontmatter 里的英文。
   * 每次现读：配置改动经 loader/volatile-update 就地更新引用并触发目录失效，
   * 缓存表会让切换停在旧语言。
   */
  private descriptions(): Record<string, string> | null {
    return readSkillDescriptions(this.getDescriptionLang?.() ?? 'zh')
  }

  invalidate(): void {
    try {
      this.control.invalidate()
    } catch {
      // 容错处理
    }
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
      options.signal?.throwIfAborted()
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      if (entry.name.startsWith('.')) continue
      const skillPath = join(this.skillDir, entry.name, 'SKILL.md')
      const parsed = await parseSkillFile(skillPath, options.signal)
      if (!parsed) {
        this.ctx.logger.warn(`[ponytail] 跳过 ${entry.name}：缺少或无效的 frontmatter`)
        continue
      }
      const descriptions = this.descriptions()
      let base: SkillBaseFields
      try {
        base = assembleSkillBase(
          parsed.data,
          skillPath,
          this.name,
          descriptions?.[entry.name] ?? readString(parsed.data, 'description')!,
        )
      } catch (err: unknown) {
        this.ctx.logger.warn(`[ponytail] 跳过 ${skillPath}：${(err as Error).message}`)
        continue
      }
      if (base.name !== entry.name) {
        this.ctx.logger.warn(
          `[ponytail] skill 名称 "${base.name}" 与目录 "${entry.name}" 不一致（以 frontmatter 为准）`,
        )
      }
      if (this.isSkillEnabled && !this.isSkillEnabled(base.name)) {
        continue
      }
      candidates.push({
        ...base,
        rank: PONYTAIL_RANK,
        locator: { path: skillPath, directory: dirname(skillPath) },
      } as SkillCandidate)
    }

    return candidates
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    options.signal?.throwIfAborted()
    if (this.isSkillEnabled && !this.isSkillEnabled(candidate.name)) return undefined
    const locatorObj = typeof candidate.locator === 'object' && candidate.locator !== null
      ? (candidate.locator as { path?: string; directory?: string })
      : undefined
    const targetPath = locatorObj?.path ?? candidate.path
    if (!targetPath) return undefined
    const parsed = await parseSkillFile(targetPath, options.signal)
    if (!parsed) return undefined
    let base: SkillBaseFields
    try {
      const descriptions = this.descriptions()
      base = assembleSkillBase(
        parsed.data,
        targetPath,
        this.name,
        descriptions?.[candidate.name] ?? readString(parsed.data, 'description')!,
      )
    } catch {
      return undefined
    }
    if (base.name !== candidate.name) return undefined
    const targetDir = locatorObj?.directory ?? dirname(targetPath)
    return {
      ...base,
      ...(targetDir !== base.resourceBase.path
        ? { resourceBase: { kind: 'directory', path: targetDir } }
        : {}),
      content: parsed.body.trim(),
    }
  }
}
