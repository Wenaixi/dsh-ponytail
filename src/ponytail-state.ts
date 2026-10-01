/**
 * ponytail-state — 运行时等级状态的唯一归属模块
 *
 * 收敛原先散落在 apply() 闭包与三处入口的等级状态读写：
 * - 内存态（currentMode）与 flag 文件的同步
 * - 「文件优先」与「内存赢」两种纠偏方向（由调用方选方法表达，不写死一处）
 * - off / review / 非法值的归一
 *
 * 与 ponytail-runtime.ts 的关系：runtime 是上游 4.10.0 flag 原语的逐行移植锚点，
 * 保持原样；本模块包装它，不重复实现 flag 路径解析。
 * 与 ponytail-config.ts 的关系：默认值解析仍归 config（默认值源 != 运行时状态）。
 *
 * 实例必须是 apply() 内的闭包变量：DSH 常驻进程下 HMR 重载会重建 apply，
 * 模块级单例会让旧状态跨实例存活，与 flag 文件双写竞争。
 */

import { normalizeMode } from './ponytail-config.js'
import { clearMode, isCopilot, readMode, setMode } from './ponytail-runtime.js'

export interface PonytailState {
  /** 当前等级的内存视图；不触发任何文件读。null 表示关闭（'off' 由 set 归一为 null） */
  get(): string | null
  /** 内存赢：写内存并把 flag 落盘（null → 删 flag）。flag 写失败自吞，不阻断会话 */
  set(mode: string | null): void
  /** 文件优先：读 flag 纠正内存；review 直通、off/非法值→null、非 Copilot 且文件缺失→清空 */
  syncFromFile(): void
  /** 内存优先：将当前内存等级同步落盘至 flag 文件（null 删 flag，有效值写 flag） */
  syncToFile(): void
}

export function createPonytailState(): PonytailState {
  let current: string | null = null

  return {
    get: () => current,

    syncToFile() {
      try {
        if (current === null) clearMode()
        else setMode(current)
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
        fileMode = readMode()
      } catch {
        return
      }
      // 与原漂移修正逻辑（4.10.0-dsh.0 apply section text 393-400）逐行等价：
      // 文件存在且与内存不同 → 文件赢；review 直通、off→null、垃圾值保留内存态（原样覆盖）
      if (fileMode !== null && fileMode !== current) {
        const nm = normalizeMode(fileMode) ?? (fileMode === 'review' ? 'review' : null)
        if (nm !== null || fileMode === 'review') current = fileMode
        else if (fileMode === 'off') current = null
      } else if (fileMode === null && current !== null) {
        // Copilot 无独立 data 目录，文件缺失时保留内存态（上游行为）
        if (!isCopilot()) current = null
      }
    },
  }
}
