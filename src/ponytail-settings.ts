/**
 * ponytail-settings — 可持久化配置的读写通道（方案 B 深模块）
 *
 * 迁移到 DSH 官方插件配置组合后，本插件的可持久化字段（defaultMode、disabledSkills）
 * 声明为 Cordis Config 的 `.volatile()` 字段，由宿主的 settings 服务投影成官方表单，
 * 写入落到 profile 补丁（`profiles/<name>/cordis.patch.yml`）。
 * 通道本身有两个实现：
 *
 * - `createSettingsSink`：官方路径，经 `ctx.settings.mutate(ns, ops, revision)` 写入。
 *   宿主负责 schema 校验、revision 冲突检测与 loader 的 volatile 热提交。
 * - `createFileSink`：回退路径，直读直写 profile 内的 `ponytail/config.json`（无 profileContext 时退回 DSH 数据根）。
 *   存在于无 profileContext 的组合（headless、CLI）——dsh-base 的 settings 行
 *   `disabled: !!js "!ctx.get('profileContext')"`，那些组合装配不上 settings 服务，
 *   此时必须仍能改配置，不能因迁移而静默失效。
 *
 * 优先级链不在本模块：resolvePriority 仍是 env > profile 补丁 > full 的唯一真源。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  DEFAULT_MODE,
  getConfigPath,
  getSharedConfigPath,
  normalizeMode,
  type FullConfigData,
  type RuntimeMode,
} from './ponytail-config.js'

/** 写入操作：与官方 settings.mutate 的 ops 形状一致（dsh-api-settings-controller:432）。 */
export interface ConfigWriteOp {
  op: 'set' | 'unset'
  path: string[]
  value?: unknown
}

/** settings 服务的最小表面；只声明本模块真正用到的三个方法。 */
export interface SettingsLike {
  mutate(ns: string, ops: ConfigWriteOp[], expectedRevision?: number): Promise<unknown>
  describe(options?: { redactSecrets?: boolean }): { namespaces?: { ns: string; value?: unknown }[] } | unknown[]
  update?(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
}

export interface PonytailConfigSink {
  /** 当前默认档；未配置时回落到内置兜底 */
  readDefaultMode(): RuntimeMode
  /** 写入默认档；非法档返回 null 且不写入 */
  writeDefaultMode(mode: string): RuntimeMode | null
  /** 当前禁用的技能名列表 */
  readDisabled(): string[]
  /** 覆盖式写入禁用列表 */
  writeDisabled(skills: string[]): void
  /** 清空两项配置（unset 而非写默认值，避免在补丁里留下冗余值） */
  reset(): Promise<void> | void
}

function namespaceOf(
  describeResult: unknown,
  namespace: string,
): { revision: number; value: Record<string, unknown> } {
  const namespaces = (
    Array.isArray(describeResult)
      ? describeResult
      : (describeResult as { namespaces?: { ns: string; revision?: number; value?: unknown }[] } | undefined)?.namespaces ?? []
  ) as { ns: string; revision?: number; value?: unknown }[]
  const row = namespaces.find((item) => item?.ns === namespace)
  const value = row?.value !== null && typeof row?.value === 'object'
    ? (row.value as Record<string, unknown>)
    : {}
  return { revision: row?.revision ?? 0, value }
}

export interface SettingsSinkOptions {
  logger?: { warn(msg: string): void }
}

export function createSettingsSink(
  ctx: { settings?: SettingsLike | null },
  namespace = 'ponytail',
  options: SettingsSinkOptions = {},
): PonytailConfigSink {
  const provided = ctx.settings
  if (provided === undefined || provided === null || typeof provided.mutate !== 'function') {
    throw new Error('settings service is not available')
  }
  const service: SettingsLike = provided
  const logger = options.logger

  // 本地镜像：启动时读一次 describe，之后跟随自己的写入（乐观更新）。
  let mirror: Record<string, unknown> = {}
  let revision = 0
  try {
    const row = namespaceOf(service.describe(), namespace)
    mirror = row.value
    revision = row.revision
  } catch {
    mirror = {}
  }

  function write(ops: ConfigWriteOp[]): void {
    // 先更新本地镜像再发请求：调用方拿到的同步返回值与 UI 显示都以此为准。
    mirror = applyOps(mirror, ops)
    void service
      .mutate(namespace, ops, revision)
      .then((response) => {
        const next = (response as { value?: { revision?: number } } | undefined)?.value?.revision
        if (typeof next === 'number') revision = next
      })
      .catch((error: unknown) => {
        // 写入被宿主拒绝（schema 校验、上层补丁覆盖、revision 冲突）时如实记录。
        // 不抛给同步调用方：命令层没有 await 链可走，抛出只会变成未处理拒绝；
        // 面板侧下一次 describe 会带回服务端真值并覆盖乐观值。
        logger?.warn(`[ponytail] 配置写入被拒（下次读取会带回真实值）：${String(error)}`)
      })
  }

  return {
    readDefaultMode(): RuntimeMode {
      const raw = mirror['defaultMode']
      return typeof raw === 'string' ? (normalizeMode(raw) ?? DEFAULT_MODE) : DEFAULT_MODE
    },
    readDisabled(): string[] {
      const raw = mirror['disabledSkills']
      return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
    },
    writeDefaultMode(mode: string): RuntimeMode | null {
      const normalized = normalizeMode(mode)
      if (normalized === null) return null
      write([{ op: 'set', path: ['defaultMode'], value: normalized }])
      return normalized
    },
    writeDisabled(skills: string[]): void {
      write([{ op: 'set', path: ['disabledSkills'], value: skills.filter((item): item is string => typeof item === 'string') }])
    },
    reset(): void {
      write([
        { op: 'unset', path: ['defaultMode'] },
        { op: 'unset', path: ['disabledSkills'] },
      ])
    },
  }
}

function applyOps(value: Record<string, unknown>, ops: ConfigWriteOp[]): Record<string, unknown> {
  const next = { ...value }
  for (const op of ops) {
    if (op.op === 'unset') delete next[op.path[0] as string]
    else next[op.path[0] as string] = op.value
  }
  return next
}

/**
 * 崩溃安全原子写盘（Crash-Safe Atomic Write）：
 * 先写入同目录下的唯一临时文件，再通过系统级原子重命名替换目标文件，
 * 从物理底层杜绝掉电或中断导致的文件 0 字节与半截断破坏。
 */
export function safeAtomicWriteFile(filePath: string, content: string): boolean {
  const dir = dirname(filePath)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // 忽略目录已存在
  }
  const tmpPath = join(
    dir,
    `.tmp.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
  )
  try {
    writeFileSync(tmpPath, content, 'utf8')
    try {
      renameSync(tmpPath, filePath)
      return true
    } catch {
      // 在 Windows 极端文件占用环境下若 renameSync 失败，安全回退直接写盘
      writeFileSync(filePath, content, 'utf8')
      try {
        unlinkSync(tmpPath)
      } catch {
        // ignore
      }
      return true
    }
  } catch {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      // ignore
    }
    return false
  }
}

const MAX_CORRUPTED_BACKUPS = 3

/**
 * 损坏现场留样备份与历史轮转：
 * 将损坏原文备份为 <file>.corrupted.<timestamp>，并仅保留最近 3 份历史留样，避免磁盘无限膨胀。
 */
export function backupCorruptedFile(filePath: string, content: string): string | null {
  try {
    const dir = dirname(filePath)
    const base = basename(filePath)
    const backupPath = join(dir, `${base}.corrupted.${Date.now()}`)
    writeFileSync(backupPath, content, 'utf8')

    // 轮转清理：仅保留最近 MAX_CORRUPTED_BACKUPS 份
    try {
      const files = readdirSync(dir)
      const corruptedFiles = files
        .filter((f) => f.startsWith(`${base}.corrupted.`))
        .sort()
      if (corruptedFiles.length > MAX_CORRUPTED_BACKUPS) {
        const toDelete = corruptedFiles.slice(0, corruptedFiles.length - MAX_CORRUPTED_BACKUPS)
        for (const f of toDelete) {
          try {
            unlinkSync(join(dir, f))
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    return backupPath
  } catch {
    return null
  }
}

/**
 * 通用 JSON 语法轻度清洗与未闭合括号对齐补全（自愈第一阶纯函数，零 I/O）
 */
export function repairJsonSyntax(raw: string): string {
  const clean = String(raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!clean) return ''
  // 清除尾部悬挂逗号：, } -> }  以及 , ] -> ]
  let healed = clean.replace(/,\s*([}\]])/g, '$1')
  let openBraces = 0
  let closeBraces = 0
  let openBrackets = 0
  let closeBrackets = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < healed.length; i++) {
    const char = healed[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (!inString) {
      if (char === '{') openBraces++
      else if (char === '}') closeBraces++
      else if (char === '[') openBrackets++
      else if (char === ']') closeBrackets++
    }
  }
  // 补全缺失的括号
  if (openBrackets > closeBrackets) {
    healed += ']'.repeat(openBrackets - closeBrackets)
  }
  if (openBraces > closeBraces) {
    healed += '}'.repeat(openBraces - closeBraces)
  }
  return healed
}

export interface SalvageConfigResult {
  salvaged: boolean
  data: FullConfigData
  recoveredFields: Record<string, unknown>
}

/**
 * 启发式破损配置挽救提取器：
 * 当 config.json 遭遇截断、缺失括号、多余逗号或乱码污染导致标准 JSON.parse 失败时，
 * 通过轻度语法修补与模式正则深度提取，最大化捞回用户原有的 defaultMode、disabledSkills 与扩展键。
 */
export function salvageConfig(raw: string): SalvageConfigResult {
  const clean = String(raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!clean) {
    return {
      salvaged: false,
      data: { defaultMode: DEFAULT_MODE, disabledSkills: [] },
      recoveredFields: {},
    }
  }

  // 1. 第一阶：轻度语法清洗与括号补全修补
  try {
    const healed = repairJsonSyntax(clean)
    const parsed = JSON.parse(healed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      const dm = typeof obj['defaultMode'] === 'string' ? normalizeMode(obj['defaultMode']) : null
      const ds = Array.isArray(obj['disabledSkills'])
        ? obj['disabledSkills'].filter((s: unknown): s is string => typeof s === 'string')
        : []
      return {
        salvaged: true,
        data: { defaultMode: dm ?? DEFAULT_MODE, disabledSkills: ds },
        recoveredFields: obj,
      }
    }
  } catch {
    // 语法修补未果，进入第二阶正则模式抢救
  }

  // 2. 第二阶：字段级正则模式匹配提取（字典使用 Object.create(null) 防范原型属性污染）
  const recovered: Record<string, unknown> = Object.create(null)

  // 提取 defaultMode
  const modeMatch = clean.match(/"defaultMode"\s*:\s*"([a-zA-Z]+)"/i)
  if (modeMatch && modeMatch[1]) {
    const nm = normalizeMode(modeMatch[1])
    if (nm) recovered['defaultMode'] = nm
  }

  // 提取 disabledSkills 数组内部的项
  const skillsMatch = clean.match(/"disabledSkills"\s*:\s*\[([\s\S]*?)(\]|$)/)
  if (skillsMatch && skillsMatch[1]) {
    const extractedSkills: string[] = []
    const itemRegex = /"([^"]+)"/g
    let match: RegExpExecArray | null
    while ((match = itemRegex.exec(skillsMatch[1])) !== null) {
      if (match[1]) extractedSkills.push(match[1])
    }
    recovered['disabledSkills'] = extractedSkills
  }

  // 提取 skillDescriptionLang
  const langMatch = clean.match(/"skillDescriptionLang"\s*:\s*"(zh|en)"/i)
  if (langMatch && langMatch[1]) {
    recovered['skillDescriptionLang'] = langMatch[1].toLowerCase()
  }

  // 尽可能抢救其它合法的标量键值对
  const scalarRegex = /"([a-zA-Z0-9_-]+)"\s*:\s*("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?)/g
  let scalarMatch: RegExpExecArray | null
  while ((scalarMatch = scalarRegex.exec(clean)) !== null) {
    const key = scalarMatch[1]
    const valRaw = scalarMatch[2]
    if (key && valRaw && !Object.hasOwn(recovered, key)) {
      try {
        recovered[key] = JSON.parse(valRaw)
      } catch {
        // ignore
      }
    }
  }

  const dm = typeof recovered['defaultMode'] === 'string' ? normalizeMode(String(recovered['defaultMode'])) : null
  const ds = Array.isArray(recovered['disabledSkills'])
    ? (recovered['disabledSkills'] as unknown[]).filter((s: unknown): s is string => typeof s === 'string')
    : []

  return {
    salvaged: Object.keys(recovered).length > 0,
    data: { defaultMode: dm ?? DEFAULT_MODE, disabledSkills: ds },
    recoveredFields: recovered,
  }
}

/**
 * 读取本地配置文件文本（支持新 profile 路径与全局旧路径回退）
 */
function readConfigFileRaw(profileDir?: string): string | null {
  const candidates = [getConfigPath(profileDir), getSharedConfigPath()]
  for (const p of candidates) {
    try {
      return readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
    } catch {
      // 忽略不可读
    }
  }
  return null
}

/**
 * 供外部或向后兼容接缝调用的内部物理文件读取。
 * 具备自愈防御引擎：若检测到磁盘文件破损，自动启动启发式提取、留样备份损坏现场、
 * 并原地安全原子重写一份合法的干净配置文件，使系统平稳运转且后续直读完全自愈。
 */
export function readDiskConfig(profileDir?: string): FullConfigData {
  const configPath = getConfigPath(profileDir)
  const raw = readConfigFileRaw(profileDir)
  if (raw === null || raw.trim().length === 0) {
    return { defaultMode: DEFAULT_MODE, disabledSkills: [] }
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      const dm = typeof obj['defaultMode'] === 'string' ? normalizeMode(obj['defaultMode']) : null
      const ds = Array.isArray(obj['disabledSkills'])
        ? obj['disabledSkills'].filter((s: unknown): s is string => typeof s === 'string')
        : []
      return { defaultMode: dm ?? DEFAULT_MODE, disabledSkills: ds }
    }
  } catch {
    // 标准解析失败，启动自愈引擎！
  }

  // 1. 启动启发式提取抢救
  const result = salvageConfig(raw)

  // 2. 现场留样备份损坏文件
  backupCorruptedFile(configPath, raw)

  // 3. 自动重新生成一份合法的标准文件！
  const regenerated: Record<string, unknown> = {
    ...result.recoveredFields,
    defaultMode: result.data.defaultMode,
    disabledSkills: result.data.disabledSkills,
  }
  safeAtomicWriteFile(configPath, JSON.stringify(regenerated, null, 2))

  return result.data
}

/** 供外部或向后兼容接缝调用的内部物理文件写入（字段级 merge，保留未知键，原子落盘） */
export function writeDiskConfig(patch: Partial<FullConfigData>, profileDir?: string): FullConfigData | null {
  try {
    const configPath = getConfigPath(profileDir)
    let config: Record<string, unknown> = {}
    try {
      const raw = readConfigFileRaw(profileDir)
      if (raw !== null && raw.trim().length > 0) {
        try {
          const parsed = JSON.parse(raw) as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            config = parsed as Record<string, unknown>
          }
        } catch {
          // 若原文件破损，先抢救已有字段并留样备份
          const salvaged = salvageConfig(raw)
          backupCorruptedFile(configPath, raw)
          config = { ...salvaged.recoveredFields }
        }
      }
    } catch {
      // 容错处理
    }
    if (patch.defaultMode !== undefined) {
      const nm = normalizeMode(patch.defaultMode)
      if (nm === null) return null
      config['defaultMode'] = nm
    }
    if (patch.disabledSkills !== undefined) {
      config['disabledSkills'] = patch.disabledSkills.filter((s: unknown) => typeof s === 'string')
    }
    const written = safeAtomicWriteFile(configPath, JSON.stringify(config, null, 2))
    if (!written) return null
    return {
      defaultMode: (normalizeMode(config['defaultMode'] as string) ?? DEFAULT_MODE) as RuntimeMode,
      disabledSkills: Array.isArray(config['disabledSkills'])
        ? config['disabledSkills'].filter((s: unknown): s is string => typeof s === 'string')
        : [],
    }
  } catch {
    return null
  }
}

/** 供外部或向后兼容接缝调用的内部物理文件重置 */
export function resetDiskConfig(profileDir?: string): FullConfigData | null {
  return writeDiskConfig({ defaultMode: DEFAULT_MODE, disabledSkills: [] }, profileDir)
}

/**
 * 文件回退通道深模块实现：无 settings 服务的组合（headless / CLI）直接读写 profile 内 config.json。
 * 完整内聚 config.json 读写、字段级 merge 与异常容错，对外提供统一的 PonytailConfigSink 契约。
 */
export function createFileSink(profileDir?: string): PonytailConfigSink {
  return {
    readDefaultMode(): RuntimeMode {
      return readDiskConfig(profileDir).defaultMode
    },
    writeDefaultMode(mode: string): RuntimeMode | null {
      const normalized = normalizeMode(mode)
      if (normalized === null) return null
      const written = writeDiskConfig({ defaultMode: normalized }, profileDir)
      return written === null ? null : written.defaultMode
    },
    readDisabled(): string[] {
      return readDiskConfig(profileDir).disabledSkills
    },
    writeDisabled(skills: string[]): void {
      writeDiskConfig({ disabledSkills: skills }, profileDir)
    },
    reset(): void {
      resetDiskConfig(profileDir)
    },
  }
}

export interface LegacyMigrationDeps {
  /** 官方 settings 服务：用 describe 判断是否已设，用 update 写入 */
  settings: {
    describe(options?: { redactSecrets?: boolean }): { namespaces?: { ns: string; value?: unknown }[] } | unknown[]
    update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
  }
  namespace: string
  /** 读取旧配置文件内容（由调用方提供，便于测试隔离） */
  readLegacy: () => { defaultMode: RuntimeMode; disabledSkills: string[] }
  /** 把旧配置改名以标记已导入（对齐 dsh-settings 的 settings.yaml.imported 做法） */
  renameLegacy: () => Promise<void>
  logger: { info(msg: string): void; warn(msg: string): void }
}

/**
 * 一次性把 config.json 的两个字段导入 profile 补丁，并改名旧文件使其幂等。
 *
 * 判据：旧配置「有内容」且 profile 侧该命名空间「还没设过」。两者同时成立才导入。
 * 导入失败只 warn，不阻断启动——老用户配置丢了可以手动再填，但插件不该起不来。
 */
export async function migrateLegacyConfig(deps: LegacyMigrationDeps): Promise<boolean> {
  const legacy = deps.readLegacy()
  const hasContent = legacy.disabledSkills.length > 0 || legacy.defaultMode !== DEFAULT_MODE
  if (!hasContent) return false

  let alreadySet = false
  try {
    const described = deps.settings.describe()
    const namespaces = (Array.isArray(described) ? described : described.namespaces ?? []) as { ns?: string }[]
    alreadySet = namespaces.some((item) => item?.ns === deps.namespace)
  } catch (error) {
    deps.logger.warn(`[ponytail] 读取 profile 命名空间失败，跳过旧配置导入：${String(error)}`)
    return false
  }
  if (alreadySet) return false

  try {
    await deps.settings.update(deps.namespace, {
      defaultMode: legacy.defaultMode,
      disabledSkills: legacy.disabledSkills,
    })
  } catch (error) {
    deps.logger.warn(`[ponytail] 旧配置导入 profile 补丁失败（可用 /ponytail default 重新设置）：${String(error)}`)
    return false
  }
  await deps.renameLegacy()
  deps.logger.info('[ponytail] 旧 config.json 已导入 profile 补丁并改名')
  return true
}
