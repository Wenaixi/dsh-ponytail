/**
 * ponytail-state — 运行时等级状态的唯一归属模块
 *
 * 收敛原先散落在 apply() 闭包与三处入口的等级状态读写：
 * - 内存态（currentMode）与 flag 文件的同步
 * - 「文件优先」与「内存赢」两种纠偏方向（由调用方选方法表达，不写死一处）
 * - off / review / 非法值的归一
 * - 扩展支持多会话隔离：每个会话锁定基线模式（baselineMode），当切换模式时通过追加通知生效，保护前缀缓存
 *
 * 与 config 的关系：flag（.ponytail-active）物理存取内联于此（原 ponytail-runtime.ts 已并入，
 * C6 收敛：46 行薄壳 + 一层间接委托不如直接内联）；也可由 options.storage 注入内存适配器隔离测试。
 * 与 ponytail-config.ts 的关系：默认值解析仍归 config（默认值源 != 运行时状态）。
 *
 * 实例必须是 apply() 内的闭包变量：DSH 常驻进程下 HMR 重载会重建 apply，
 * 模块级单例会让旧状态跨实例存活，与 flag 文件双写竞争。
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeMode, getConfigDir } from './ponytail-config.js';
import { createFileSink } from './ponytail-settings.js';
// flag 物理存取（原 src/ponytail-runtime.ts，C6 内联）：profile 内 .ponytail-active
const STATE_FILE = '.ponytail-active';
export function createDiskStorage(profileDir) {
    const statePath = () => join(getConfigDir(profileDir), STATE_FILE);
    return {
        read: () => {
            try {
                return readFileSync(statePath(), 'utf8').trim() || null;
            }
            catch {
                return null;
            }
        },
        write: (mode) => {
            mkdirSync(dirname(statePath()), { recursive: true });
            writeFileSync(statePath(), mode, 'utf8');
        },
        clear: () => {
            try {
                unlinkSync(statePath());
            }
            catch {
                // ignore
            }
        },
    };
}
const DEFAULT_SESSION_ID = '__default__';
export function createPonytailState(options) {
    const storage = options?.storage ?? createDiskStorage(options?.profileDir);
    let current = null;
    const sink = options?.sink ?? createFileSink(options?.profileDir);
    let disabledSkills = new Set(sink.readDisabled());
    const profileDir = options?.profileDir;
    const sessionStatesPath = () => join(getConfigDir(profileDir), 'session-states.json');
    function loadPersistedSessions() {
        try {
            const raw = readFileSync(sessionStatesPath(), 'utf8');
            return JSON.parse(raw);
        }
        catch {
            return {};
        }
    }
    function savePersistedSessions(map) {
        try {
            const obj = {};
            for (const [k, v] of map.entries()) {
                if (k !== DEFAULT_SESSION_ID)
                    obj[k] = v;
            }
            mkdirSync(dirname(sessionStatesPath()), { recursive: true });
            writeFileSync(sessionStatesPath(), JSON.stringify(obj, null, 2), 'utf8');
        }
        catch {
            // best-effort：文件写失败不阻断内存与会话
        }
    }
    // 会话隔离状态表（带 LRU 上限防泄漏与持久化备份恢复）
    const sessions = new Map();
    const MAX_SESSIONS = 100;
    function normalizeSessionKey(id) {
        const trimmed = String(id ?? '').trim();
        return trimmed.length > 0 ? trimmed : DEFAULT_SESSION_ID;
    }
    return {
        get: () => current,
        getDisabledSkills() {
            return Array.from(disabledSkills);
        },
        setDisabledSkills(skills) {
            disabledSkills = new Set(skills);
            sink.writeDisabled(Array.from(disabledSkills));
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
            sink.writeDisabled(Array.from(disabledSkills));
            return !disabledSkills.has(name);
        },
        setDefaultMode(mode) {
            const nm = normalizeMode(mode);
            if (nm)
                sink.writeDefaultMode(nm);
        },
        resetToDefaults() {
            sink.reset();
            disabledSkills.clear();
            current = 'full';
            sessions.clear();
            storage.write('full');
        },
        reloadDisabledSkills() {
            disabledSkills = new Set(sink.readDisabled());
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
            const defState = sessions.get(DEFAULT_SESSION_ID);
            if (defState) {
                defState.effectiveMode = current;
            }
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
        getSession(sessionId) {
            const key = normalizeSessionKey(sessionId);
            let state = sessions.get(key);
            if (state) {
                // 访问序 LRU：命中时移动至 Map 末尾，维持最新活跃度
                sessions.delete(key);
                sessions.set(key, state);
                return state;
            }
            // 跨进程重启 / LRU 淘汰唤醒保护：优先从 Profile 磁盘恢复历史基线！
            if (key !== DEFAULT_SESSION_ID) {
                const persisted = loadPersistedSessions()[key];
                if (persisted) {
                    state = persisted;
                    sessions.set(key, state);
                    return state;
                }
            }
            if (sessions.size >= MAX_SESSIONS) {
                // 循环找到首个非 DEFAULT_SESSION_ID 的项淘汰（彻底消除首键死锁）
                for (const k of sessions.keys()) {
                    if (k !== DEFAULT_SESSION_ID) {
                        sessions.delete(k);
                        break;
                    }
                }
            }
            // 全新会话诞生：基线锁定为当前全局模式（或 full）
            const baseline = current ?? 'full';
            state = {
                sessionId: key,
                baselineMode: baseline,
                effectiveMode: baseline,
                lastEmittedMode: baseline,
                explicitlySet: false,
            };
            sessions.set(key, state);
            savePersistedSessions(sessions);
            return state;
        },
        setSessionMode(sessionId, mode) {
            const key = normalizeSessionKey(sessionId);
            const session = this.getSession(key);
            const normalized = mode === 'off' ? null : normalizeMode(mode ?? '') ?? mode;
            session.effectiveMode = normalized;
            session.explicitlySet = true; // 用户在该会话内显式输入过命令，标记保护
            savePersistedSessions(sessions);
            if (key === DEFAULT_SESSION_ID) {
                current = normalized;
                this.syncToFile();
            }
        },
        markSessionEmitted(sessionId, mode) {
            const key = normalizeSessionKey(sessionId);
            const session = this.getSession(key);
            session.lastEmittedMode = mode === 'off' ? null : mode;
            savePersistedSessions(sessions);
        },
        syncGlobalModeToSessions(newDefaultMode) {
            const normalized = normalizeMode(newDefaultMode);
            if (!normalized)
                return;
            current = normalized;
            this.syncToFile();
            // 对已有会话：保持 baselineMode 绝对不变（保护前缀缓存）；
            // 仅同步那些从未显式设置过的跟随型会话，保护用户的明确意图
            for (const session of sessions.values()) {
                if (!session.explicitlySet) {
                    session.effectiveMode = normalized;
                }
            }
            savePersistedSessions(sessions);
        },
    };
}
/**
 * 纯函数守卫：「禁用主技能 ponytail → 关闭运行等级」业务规则的唯一实现。
 * 此前该规则散落在 ponytail-http.ts POST 两分支（disabledSkills 数组与 toggleSkill），
 * 现收敛为单一导出，调用方共享一个守卫（根因修复，防两分支不一致）。
 */
export function isMainSkillDisabled(disabled) {
    return disabled.includes('ponytail');
}
//# sourceMappingURL=ponytail-state.js.map