/**
 * ponytail-config — 移植自 hooks/ponytail-config.js
 *
 * 三级默认解析：环境变量 > 配置文件 > full
 * 保留上游全部边界与兼容行为：
 * - review 不可作默认 (#377)
 * - isDeactivationCommand 全句匹配
 * - isShellSafe 仅白名单路径字符
 * - BOM 去除、config 文件容错
 *
 * 数据根契约（见 docs/adr/0005）：配置与 flag 一律落在 DSH 统一用户数据根
 * $DSH_HOME/ponytail（默认 ~/.dsh/ponytail），与 cordis 内置包
 * （.credentials.yaml / profiles/ / attachments/ 等）保持同一根，
 * 从而跨平台一致、跟随 DSH_HOME 覆盖、天然随 profile 隔离。
 * 不再使用 XDG / APPDATA 等宿主平台约定（旧位置仅作一次性兼容读取）。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const DEFAULT_MODE = 'full'
export const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'] as const

export type RuntimeMode = (typeof RUNTIME_MODES)[number]

export function normalizeMode(mode: string): RuntimeMode | null {
  if (typeof mode !== 'string') return null
  const n = mode.trim().toLowerCase()
  return (RUNTIME_MODES as readonly string[]).includes(n) ? (n as RuntimeMode) : null
}


// 仅白名单路径字符，避免注入 shell 元字符
export function isShellSafe(p: string): boolean {
  return typeof p === 'string' && /^[A-Za-z0-9 _.\-:/\\~]+$/.test(p)
}

// ---------------------------------------------------------------------------
// DSH 统一数据根解析
// ---------------------------------------------------------------------------

/** DSH 数据根环境变量（与 @deepseek-ai/dsh-home-paths 的 DSH_HOME_ENV 一致） */
export const DSH_HOME_ENV = 'DSH_HOME'

/** 默认 DSH 数据根目录名（与 @deepseek-ai/dsh-home-paths 的 DSH_HOME_DIR_NAME 一致） */
const DSH_HOME_DIR_NAME = '.dsh'

/**
 * 展开 ~ / ~/ / ~（反斜杠）前缀为操作系统家目录（复刻官方 expandHomePath 语义）。
 * 官方解析器未就绪或不可达时，由本地等价实现使用。
 */
function expandHomePath(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2))
  return p
}

/**
 * 解析 DSH 统一数据根（逐行复刻 @deepseek-ai/dsh-home-paths 的 resolveDshHome 语义）。
 *
 * 优先级（高到低）：显式传入的 configured > $DSH_HOME（空白视为未设置）> ~/.dsh。
 *
 * 为何不 import 官方实现：该包由 DSH 宿主提供、本仓不声明依赖；实测从插件实际运行
 * 视角解析会抛 ERR_MODULE_NOT_FOUND，静态 import 会让真实用户环境加载即崩，而动态
 * 导入的异步预热又会让「用官方还是用本地」随调用时机漂移。官方实现是 6 行纯函数，
 * 此处等价复刻，行为确定且零依赖；契约漂移风险由 verify.mjs 的路径断言兜底。
 */
export function resolveDshHome(configured?: string, env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env[DSH_HOME_ENV]
  const base =
    configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), DSH_HOME_DIR_NAME))
  return resolve(expandHomePath(base))
}

/**
 * 配置目录：DSH 数据根下的 ponytail 子目录。
 * 平台无关——路径分隔符一律由 node:path 生成，不含任何平台判断。
 */
export function getConfigDir(): string {
  return join(resolveDshHome(), 'ponytail')
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

/**
 * 迁移前的旧配置路径（4.10.0-dsh.4 及以前使用的宿主平台约定位置）。
 *
 * 仅用于一次性兼容读取：老用户升级后，新位置尚未生成时回退读取旧配置，
 * 避免已自定义的等级/技能开关静默丢失。写入永远只写新位置，
 * 旧目录不删除也不改写，数据所有权保持清晰。
 * ponytail: 兼容读取保留至下一个大版本（5.x 首发）后移除，届时可整段删除。
 */
export function getLegacyConfigDir(): string | null {
  const legacyDir =
    process.env['XDG_CONFIG_HOME'] !== undefined
      ? join(process.env['XDG_CONFIG_HOME'], 'ponytail')
      : process.platform === 'win32'
        ? join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'ponytail')
        : join(homedir(), '.config', 'ponytail')
  return legacyDir === getConfigDir() ? null : legacyDir
}

export function getLegacyConfigPath(): string | null {
  const dir = getLegacyConfigDir()
  return dir ? join(dir, 'config.json') : null
}

/**
 * 读取配置文件原文：新位置优先，缺失时一次性回退旧位置。
 * 返回 null 表示两处都不存在或均不可读。
 */
export function readConfigFileText(): string | null {
  const candidates = [getConfigPath(), getLegacyConfigPath()]
  for (const p of candidates) {
    if (!p) continue
    try {
      return readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
    } catch {
      // 该位置不存在或不可读，尝试下一个
    }
  }
  return null
}

export function getDefaultMode(): RuntimeMode {
  const envMode = process.env['PONYTAIL_DEFAULT_MODE']
  if (envMode && (RUNTIME_MODES as readonly string[]).includes(envMode.toLowerCase())) {
    return envMode.toLowerCase() as RuntimeMode
  }
  try {
    const raw = readConfigFileText()
    if (raw === null) return DEFAULT_MODE as RuntimeMode
    const config = JSON.parse(raw) as Record<string, unknown>
    const dm = config['defaultMode']
    if (typeof dm === 'string' && (RUNTIME_MODES as readonly string[]).includes(dm.toLowerCase())) {
      return dm.toLowerCase() as RuntimeMode
    }
  } catch {
    // 不存在或解析失败则回退
  }
  return DEFAULT_MODE as RuntimeMode
}


export interface FullConfigData {
  defaultMode: RuntimeMode
  disabledSkills: string[]
}

/**
 * 私有解析唯一真源：把 config.json 原文（或 null）解析为 FullConfigData。
 * defaultMode 经 normalizeMode 归一（非法→DEFAULT_MODE）；disabledSkills 过滤字符串数组。
 * readFullConfig / getDefaultMode（config 分支）共用；writeFullConfig 的 merge 读段
 * 仍需原始对象（保留未知键），只复用本函数的字段归一规则。
 */
function parseConfigObject(raw: string | null): FullConfigData {
  if (raw === null) return { defaultMode: DEFAULT_MODE, disabledSkills: [] }
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
    // 忽略异常，使用默认值
  }
  return { defaultMode: DEFAULT_MODE, disabledSkills: [] }
}

export function readFullConfig(): FullConfigData {
  return parseConfigObject(readConfigFileText())
}

/**
 * 字段级 merge 写盘：保留 config.json 中用户手写的未知字段（不再重建为两键对象），
 * defaultMode 经 normalizeMode 校验——非法值拒绝返回 null 不写盘（writeDefaultMode 语义统一）。
 * 失败契约：写盘异常返回 null（与 resetFullConfig/writeDefaultMode 一致）。
 */
export function writeFullConfig(patch: Partial<FullConfigData>): FullConfigData | null {
  try {
    const configPath = getConfigPath()
    mkdirSync(dirname(configPath), { recursive: true })
    let config: Record<string, unknown> = {}
    try {
      const raw = readConfigFileText()
      const parsed = raw === null ? null : (JSON.parse(raw) as unknown)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed as Record<string, unknown>
    } catch {
      // 文件损坏时按空对象处理（保留未知键的前提是不覆盖原文件）
    }
    if (patch.defaultMode !== undefined) {
      const nm = normalizeMode(patch.defaultMode)
      if (nm === null) return null
      config['defaultMode'] = nm
    }
    if (patch.disabledSkills !== undefined) {
      config['disabledSkills'] = patch.disabledSkills.filter((s: unknown) => typeof s === 'string')
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
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

export function resetFullConfig(): FullConfigData | null {
  return writeFullConfig({
    defaultMode: DEFAULT_MODE,
    disabledSkills: [],
  })
}

export function writeDefaultMode(mode: string): RuntimeMode | null {
  const normalized = normalizeMode(mode)
  if (!normalized) return null
  const written = writeFullConfig({ defaultMode: normalized })
  if (written === null) return null
  return normalized
}

/**
 * 插件配置（entry 与 skill provider 共享，避免 ponytail-skills 反向导入 entry 造成循环依赖）
 * 默认值写 schema（Schemastery），review 不可作默认（#377）
 */
export interface PonytailConfig {
  /** 禁用的技能名称列表 */
  disabledSkills?: string[]
  /** 注册到 ctx.skills 的 provider 名称 */
  providerName?: string
  /** skill 目录绝对路径，默认取包内 skills/ */
  skillDir?: string
  /** 默认强度，off 则不自动激活 */
  defaultMode?: 'off' | 'lite' | 'full' | 'ultra'
}
