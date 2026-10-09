/**
 * ponytail-config — 移植自 hooks/ponytail-config.js
 *
 * 三级默认解析：环境变量 > Profile 补丁 > 内置兜底
 * 保留已核对的上游行为边界，并按 DSH 运行时契约适配：
 * - review 不可作默认 (#377)
 * - isDeactivationCommand 全句匹配
 * - isShellSafe 仅白名单路径字符
 * - BOM 去除、config 文件容错
 *
 * 数据根契约（见 docs/adr/0005）：配置与 flag 一律落在 DSH 统一用户数据根
 * $DSH_HOME/ponytail（默认 ~/.dsh/ponytail），与 cordis 内置包
 * （.credentials.yaml / profiles/ / attachments/ 等）保持同一根，
 * 从而跨平台一致、跟随 DSH_HOME 覆盖。
 * 注意 resolveDshHome() 结构上不含 profile 维度：该目录下的文件被同机所有实例共享，
 * 配置与 flag 的 profile 隔离由 getConfigDir(profileDir) 单独承担（ADR-0009）。
 * 不再使用 XDG / APPDATA 等宿主平台约定（旧位置仅作一次性兼容读取）。
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readDiskConfig, writeDiskConfig, resetDiskConfig, createFileSink, } from './ponytail-settings.js';
export const DEFAULT_MODE = 'full';
export const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'];
export function normalizeMode(mode) {
    if (typeof mode !== 'string')
        return null;
    const n = mode.trim().toLowerCase();
    return RUNTIME_MODES.includes(n) ? n : null;
}
// 仅白名单路径字符，避免注入 shell 元字符
export function isShellSafe(p) {
    return typeof p === 'string' && /^[A-Za-z0-9 _.\-:/\\~]+$/.test(p);
}
// ---------------------------------------------------------------------------
// DSH 统一数据根解析
// ---------------------------------------------------------------------------
/** DSH 数据根环境变量（与 @deepseek-ai/dsh-home-paths 的 DSH_HOME_ENV 一致） */
export const DSH_HOME_ENV = 'DSH_HOME';
/** 默认 DSH 数据根目录名（与 @deepseek-ai/dsh-home-paths 的 DSH_HOME_DIR_NAME 一致） */
const DSH_HOME_DIR_NAME = '.dsh';
/**
 * 展开 ~ / ~/ / ~（反斜杠）前缀为操作系统家目录（复刻官方 expandHomePath 语义）。
 * 官方解析器未就绪或不可达时，由本地等价实现使用。
 */
function expandHomePath(p) {
    if (p === '~')
        return homedir();
    if (p.startsWith('~/') || p.startsWith('~\\'))
        return join(homedir(), p.slice(2));
    return p;
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
export function resolveDshHome(configured, env = process.env) {
    const fromEnv = env[DSH_HOME_ENV];
    const base = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), DSH_HOME_DIR_NAME));
    return resolve(expandHomePath(base));
}
/**
 * 配置目录：DSH 数据根下的 ponytail 子目录。
 * 平台无关——路径分隔符一律由 node:path 生成，不含任何平台判断。
 */
export function getConfigDir(profileDir) {
    return profileDir === undefined || profileDir === '' ? join(resolveDshHome(), 'ponytail') : join(profileDir, 'ponytail');
}
export function getConfigPath(profileDir) {
    return join(getConfigDir(profileDir), 'config.json');
}
/**
 * 全局共享的旧配置路径（ADR-0005 时代的位置，被所有实例共享）。
 *
 * 只在迁移窗口内被读：实例在「全局文件存在且 profile 内尚未生成」时导入，
 * 导入后把全局文件改名标记为已迁，使后续实例从干净状态启动。
 * 正常读写一律经 getConfigDir()，此路径不参与优先级链。
 */
export function getSharedConfigPath() {
    return join(resolveDshHome(), 'ponytail', 'config.json');
}
/**
 * 读取配置文件原文：新位置优先，缺失时一次性回退旧位置。
 * 返回 null 表示两处都不存在或均不可读。
 */
export function readConfigFileText(profileDir) {
    const candidates = [getConfigPath(profileDir), getSharedConfigPath()];
    for (const p of candidates) {
        try {
            return readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
        }
        catch {
            // 该位置不存在或不可读，尝试下一个
        }
    }
    return null;
}
export function getDefaultMode(profileDir) {
    const envMode = process.env['PONYTAIL_DEFAULT_MODE'];
    if (envMode && RUNTIME_MODES.includes(envMode.toLowerCase())) {
        return envMode.toLowerCase();
    }
    try {
        const raw = readConfigFileText(profileDir);
        if (raw === null)
            return DEFAULT_MODE;
        const config = JSON.parse(raw);
        const dm = config['defaultMode'];
        if (typeof dm === 'string' && RUNTIME_MODES.includes(dm.toLowerCase())) {
            return dm.toLowerCase();
        }
    }
    catch {
        // 不存在或解析失败则回退
    }
    return DEFAULT_MODE;
}
/**
 * 读取完整配置（向后兼容接缝薄委托，统一经由 FileSink 底层深模块处理）
 */
export function readFullConfig(profileDir) {
    return readDiskConfig(profileDir);
}
/**
 * 字段级 merge 写盘（向后兼容接缝薄委托，统一由 FileSink 独占处理）
 */
export function writeFullConfig(patch, profileDir) {
    return writeDiskConfig(patch, profileDir);
}
/**
 * 重置配置（向后兼容接缝薄委托）
 */
export function resetFullConfig(profileDir) {
    return resetDiskConfig(profileDir);
}
/**
 * 写入默认档（向后兼容接缝薄委托，统一通过 FileSink 实现）
 */
export function writeDefaultMode(mode, profileDir) {
    return createFileSink(profileDir).writeDefaultMode(mode);
}
/**
 * 配置值归一：undefined/非法 → 'auto'（未配置，由调用方决定跟随宿主或兜底 zh），
 * zh/en 原样。纯函数，零 I/O；宿主语言对齐逻辑在 ponytail.ts（本模块不读任何服务）。
 */
export function resolveSkillLang(raw) {
    return raw === 'en' ? 'en' : raw === 'zh' ? 'zh' : 'auto';
}
/**
 * 读一个可能是 volatile 引用、可能是裸值、也可能读到 undefined 的字段。
 *
 * 为什么必须容这三态：schemastery 对 `.volatile()` 字段无条件造出引用（其值取 schema 默认值，
 * schemastery/lib/index.mjs:480），没有默认值时也是「引用包着 undefined」；
 * 而直接构造 config 对象的测试路径拿到的是裸值。两者必须读出同一业务值，
 * 否则同一字段在不同入口会给出不同结果。
 */
export function readVolatile(field) {
    if (field === undefined || field === null)
        return undefined;
    if (typeof field === 'object' && typeof field.get === 'function') {
        return field.get();
    }
    return field;
}
//# sourceMappingURL=ponytail-config.js.map