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

import { DEFAULT_MODE, normalizeMode, readFullConfig, resetFullConfig, writeFullConfig } from './ponytail-config.js'
import type { RuntimeMode } from './ponytail-config.js'

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
 * 文件回退通道：无 settings 服务的组合（headless / CLI）直接读写 profile 内 config.json。
 * 与 settings 通道共享同一组语义：非法档不写、reset 清空两项。
 */
export function createFileSink(profileDir?: string): PonytailConfigSink {
  return {
    readDefaultMode(): RuntimeMode {
      return readFullConfig(profileDir).defaultMode
    },
    writeDefaultMode(mode: string): RuntimeMode | null {
      const normalized = normalizeMode(mode)
      if (normalized === null) return null
      const written = writeFullConfig({ defaultMode: normalized }, profileDir)
      return written === null ? null : written.defaultMode
    },
    readDisabled(): string[] {
      return readFullConfig(profileDir).disabledSkills
    },
    writeDisabled(skills: string[]): void {
      writeFullConfig({ disabledSkills: skills }, profileDir)
    },
    reset(): void {
      resetFullConfig(profileDir)
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
