/**
 * ponytail-state — 运行时等级状态的唯一归属模块
 *
 * 收敛原先散落在 apply() 闭包与三处入口的等级状态读写：
 * - 内存态（currentMode）与 flag 文件的同步
 * - 「文件优先」与「内存赢」两种纠偏方向（由调用方选方法表达，不写死一处）
 * - off / review / 非法值的归一
 *
 * 与 ponytail-runtime.ts 的关系：runtime 负责 DSH 配置目录下 flag 的物理存取，
 * 本模块默认委托它作为默认持久化实现，也可由 options.storage 注入内存适配器隔离测试。
 * 与 ponytail-config.ts 的关系：默认值解析仍归 config（默认值源 != 运行时状态）。
 *
 * 实例必须是 apply() 内的闭包变量：DSH 常驻进程下 HMR 重载会重建 apply，
 * 模块级单例会让旧状态跨实例存活，与 flag 文件双写竞争。
 */
import { normalizeMode, readFullConfig, writeFullConfig, resetFullConfig } from './ponytail-config.js';
import { clearMode, readMode, setMode } from './ponytail-runtime.js';
const defaultDiskStorage = {
    read: () => readMode(),
    write: (mode) => setMode(mode),
    clear: () => clearMode(),
};
export function createPonytailState(options) {
    const storage = options?.storage ?? defaultDiskStorage;
    let current = null;
    let disabledSkills = new Set(readFullConfig().disabledSkills);
    return {
        get: () => current,
        getDisabledSkills() {
            return Array.from(disabledSkills);
        },
        setDisabledSkills(skills) {
            disabledSkills = new Set(skills);
            writeFullConfig({ disabledSkills: Array.from(disabledSkills) });
        },
        isSkillEnabled(name) {
            return !disabledSkills.has(name);
        },
        toggleSkill(name, enabled) {
            const targetEnabled = enabled !== undefined ? enabled : disabledSkills.has(name);
            if (targetEnabled) {
                disabledSkills.delete(name);
            }
            else {
                disabledSkills.add(name);
            }
            writeFullConfig({ disabledSkills: Array.from(disabledSkills) });
            return !disabledSkills.has(name);
        },
        setDefaultMode(mode) {
            const nm = normalizeMode(mode);
            if (nm) {
                writeFullConfig({ defaultMode: nm });
            }
        },
        resetToDefaults() {
            resetFullConfig();
            disabledSkills.clear();
            current = 'full';
            storage.write('full');
        },
        syncToFile() {
            try {
                if (current === null)
                    storage.clear();
                else
                    storage.write(current);
            }
            catch {
                // best-effort：flag 写失败只影响跨进程可见性，不阻断当前会话
            }
        },
        set(mode) {
            // 单一关闭契约：'off' 与 null 都是关闭，统一为 null（删 flag）。
            current = mode === 'off' ? null : mode;
            this.syncToFile();
        },
        syncFromFile() {
            let fileMode;
            try {
                fileMode = storage.read();
            }
            catch {
                return;
            }
            // 文件存在且与内存不同 → 文件赢；review 直通、off→null、垃圾值保留内存态（原样覆盖）
            if (fileMode !== null && fileMode !== current) {
                const nm = normalizeMode(fileMode) ?? (fileMode === 'review' ? 'review' : null);
                if (nm !== null || fileMode === 'review')
                    current = fileMode;
                else if (fileMode === 'off')
                    current = null;
            }
            else if (fileMode === null && current !== null) {
                // DSH 单一宿主：flag 缺失即关闭（外部宿主共存语义已移除，见 ADR-0004）
                current = null;
            }
        },
    };
}
//# sourceMappingURL=ponytail-state.js.map