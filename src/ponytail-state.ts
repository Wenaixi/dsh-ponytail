/**
 * ponytail-state — 运行时等级状态的唯一归属模块
 *
 * 收敛原先散落在 apply() 闭包与三处入口的等级状态读写：
 * - 内存态（currentMode）与 flag 文件的同步
 * - 「文件优先」与「内存赢」两种纠偏方向（由调用方选方法表达，不写死一处）
 * - off / review / 非法值的归一
 *
 * 与 config 的关系：flag（.ponytail-active）物理存取内联于此（原 ponytail-runtime.ts 已并入，
 * C6 收敛：46 行薄壳 + 一层间接委托不如直接内联）；也可由 options.storage 注入内存适配器隔离测试。
 * 与 ponytail-config.ts 的关系：默认值解析仍归 config（默认值源 != 运行时状态）。
 *
 * 实例必须是 apply() 内的闭包变量：DSH 常驻进程下 HMR 重载会重建 apply，
 * 模块级单例会让旧状态跨实例存活，与 flag 文件双写竞争。
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { normalizeMode, readFullConfig, writeFullConfig, resetFullConfig, getConfigDir } from './ponytail-config.js'

/**
 * 状态持久化存储适配器契约（两个适配器证明切面价值：生产物理磁盘 + 测试内存隔离）
 */
export interface PonytailStorage {
  read(): string | null
  write(mode: string): void
  clear(): void
}

export interface PonytailStateOptions {
  /** 可选注入的存储适配器；缺省时使用内联的 DSH 配置目录磁盘实现（flag 存取已并入本模块） */
  storage?: PonytailStorage
}

export interface PonytailState {
  /** 当前等级的内存视图；不触发任何文件读。null 表示关闭（'off' 由 set 归一为 null） */
  get(): string | null
  /** 内存赢：写内存并把 flag 落盘（null → 删 flag）。flag 写失败自吞，不阻断会话 */
  set(mode: string | null): void
  /** 文件优先：读 flag 纠正内存；review 直通、off/非法值→null、flag 缺失→清空 */
  syncFromFile(): void
  /** 内存优先：将当前内存等级同步落盘至 flag 文件（null 删 flag，有效值写 flag） */
  syncToFile(): void
  /** 当前禁用的技能名称列表 */
  getDisabledSkills(): string[]
  /** 设置禁用的技能列表（并持久化写盘） */
  setDisabledSkills(skills: string[]): void
  /** 检查某个技能是否启用（未被禁用） */
  isSkillEnabled(name: string): boolean
  /** 切换某个技能的状态（启用/禁用），并持久化写盘 */
  toggleSkill(name: string, enabled?: boolean): boolean
  /** 设置全局默认等级并持久化落盘 */
  setDefaultMode(mode: string): void
  /** 恢复所有默认配置（等级切回 full，启用所有技能） */
  resetToDefaults(): void
  /** 文件优先：重读 config.json 的 disabledSkills 重建内存 Set（外部手改文件后的收敛入口） */
  reloadDisabledSkills(): void
}

// flag 物理存取（原 src/ponytail-runtime.ts，C6 内联）：DSH 数据根下 .ponytail-active
const STATE_FILE = '.ponytail-active'
function statePath(): string {
  return join(getConfigDir(), STATE_FILE)
}
export function setMode(mode: string): void {
  mkdirSync(dirname(statePath()), { recursive: true })
  writeFileSync(statePath(), mode, 'utf8')
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

const defaultDiskStorage: PonytailStorage = {
  read: () => readMode(),
  write: (mode) => setMode(mode),
  clear: () => clearMode(),
}

export function createPonytailState(options?: PonytailStateOptions): PonytailState {
  const storage = options?.storage ?? defaultDiskStorage
  let current: string | null = null

  let disabledSkills = new Set<string>(readFullConfig().disabledSkills)

  return {
    get: () => current,
    getDisabledSkills(): string[] {
      return Array.from(disabledSkills)
    },

    setDisabledSkills(skills: string[]): void {
      disabledSkills = new Set(skills)
      writeFullConfig({ disabledSkills: Array.from(disabledSkills) })
    },

    isSkillEnabled(name: string): boolean {
      return !disabledSkills.has(name)
    },

    toggleSkill(name: string, enabled?: boolean): boolean {
      const targetEnabled = enabled !== undefined ? enabled : disabledSkills.has(name)
      if (targetEnabled) {
        disabledSkills.delete(name)
      } else {
        disabledSkills.add(name)
      }
      writeFullConfig({ disabledSkills: Array.from(disabledSkills) })
      return !disabledSkills.has(name)
    },

    setDefaultMode(mode: string): void {
      const nm = normalizeMode(mode)
      if (nm) {
        writeFullConfig({ defaultMode: nm })
      }
    },

    resetToDefaults(): void {
      resetFullConfig()
      disabledSkills.clear()
      current = 'full'
      storage.write('full')
    },

    reloadDisabledSkills(): void {
      disabledSkills = new Set<string>(readFullConfig().disabledSkills)
    },

    syncToFile() {
      try {
        if (current === null) storage.clear()
        else storage.write(current)
      } catch {
        // best-effort：flag 写失败只影响跨进程可见性，不阻断当前会话
      }
    },

    set(mode) {
      // 单一关闭契约：'off' 与 null 都是关闭，统一为 null（删 flag）。
      current = mode === 'off' ? null : mode
      this.syncToFile()
    },

    syncFromFile() {
      let fileMode: string | null
      try {
        fileMode = storage.read()
      } catch {
        return
      }
      // 文件存在且与内存不同 → 文件赢；review 直通、off→null、垃圾值保留内存态（原样覆盖）
      if (fileMode !== null && fileMode !== current) {
        const nm = normalizeMode(fileMode) ?? (fileMode === 'review' ? 'review' : null)
        if (nm !== null || fileMode === 'review') current = fileMode
        else if (fileMode === 'off') current = null
      } else if (fileMode === null && current !== null) {
        // DSH 单一宿主：flag 缺失即关闭（外部宿主共存语义已移除，见 ADR-0004）
        current = null
      }
    },
  }
}

/**
 * 纯函数守卫：「禁用主技能 ponytail → 关闭运行等级」业务规则的唯一实现。
 * 此前该规则散落在 ponytail-http.ts POST 两分支（disabledSkills 数组与 toggleSkill），
 * 现收敛为单一导出，调用方共享一个守卫（根因修复，防两分支不一致）。
 */
export function isMainSkillDisabled(disabled: readonly string[]): boolean {
  return disabled.includes('ponytail')
}
