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
export declare const DEFAULT_MODE = "full";
export declare const RUNTIME_MODES: readonly ["off", "lite", "full", "ultra"];
export type RuntimeMode = (typeof RUNTIME_MODES)[number];
export declare function normalizeMode(mode: string): RuntimeMode | null;
export declare function isShellSafe(p: string): boolean;
/** DSH 数据根环境变量（与 @deepseek-ai/dsh-home-paths 的 DSH_HOME_ENV 一致） */
export declare const DSH_HOME_ENV = "DSH_HOME";
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
export declare function resolveDshHome(configured?: string, env?: Record<string, string | undefined>): string;
/**
 * 配置目录：DSH 数据根下的 ponytail 子目录。
 * 平台无关——路径分隔符一律由 node:path 生成，不含任何平台判断。
 */
export declare function getConfigDir(profileDir?: string): string;
export declare function getConfigPath(profileDir?: string): string;
/**
 * 全局共享的旧配置路径（ADR-0005 时代的位置，被所有实例共享）。
 *
 * 只在迁移窗口内被读：实例在「全局文件存在且 profile 内尚未生成」时导入，
 * 导入后把全局文件改名标记为已迁，使后续实例从干净状态启动。
 * 正常读写一律经 getConfigDir()，此路径不参与优先级链。
 */
export declare function getSharedConfigPath(): string;
/**
 * 读取配置文件原文：新位置优先，缺失时一次性回退旧位置。
 * 返回 null 表示两处都不存在或均不可读。
 */
export declare function readConfigFileText(profileDir?: string): string | null;
export declare function getDefaultMode(profileDir?: string): RuntimeMode;
export interface FullConfigData {
    defaultMode: RuntimeMode;
    disabledSkills: string[];
}
export declare function readFullConfig(profileDir?: string): FullConfigData;
/**
 * 字段级 merge 写盘：保留 config.json 中用户手写的未知字段（不再重建为两键对象），
 * defaultMode 经 normalizeMode 校验——非法值拒绝返回 null 不写盘（writeDefaultMode 语义统一）。
 * 失败契约：写盘异常返回 null（与 resetFullConfig/writeDefaultMode 一致）。
 */
export declare function writeFullConfig(patch: Partial<FullConfigData>, profileDir?: string): FullConfigData | null;
export declare function resetFullConfig(profileDir?: string): FullConfigData | null;
export declare function writeDefaultMode(mode: string, profileDir?: string): RuntimeMode | null;
/**
 * volatile 配置引用：宿主在 `.volatile()` 字段上放的活值容器（cosmokit/lib/index.js:102-108）。
 * 写入经 settings 落到 profile 补丁；进程内由 loader 就地更新，无需重挂载插件。
 */
export interface VolatileRef<T> {
    get(): T;
}
/**
 * 插件配置（entry 与 skill provider 共享，避免 ponytail-skills 反向导入 entry 造成循环依赖）
 * 默认值写 schema（Schemastery），review 不可作默认（#377）
 *
 * 迁移到官方配置组合后，两个可持久化字段声明为 volatile：解析结果是 VolatileRef 而非裸值，
 * 读侧一律经 readVolatile()。未配置时引用内部是 undefined（不是缺字段），让位 resolvePriority。
 */
export interface PonytailConfig {
    /** 禁用的技能名称列表（volatile 引用） */
    disabledSkills?: VolatileRef<string[]>;
    /** 注册到 ctx.skills 的 provider 名称 */
    providerName?: string;
    /** skill 目录绝对路径，默认取包内 skills/ */
    skillDir?: string;
    /** 默认强度，off 则不自动激活（volatile 引用） */
    defaultMode?: VolatileRef<'off' | 'lite' | 'full' | 'ultra'>;
}
/**
 * 读一个可能是 volatile 引用、可能是裸值、也可能读到 undefined 的字段。
 *
 * 为什么必须容这三态：schemastery 对 `.volatile()` 字段无条件造出引用（其值取 schema 默认值，
 * schemastery/lib/index.mjs:480），没有默认值时也是「引用包着 undefined」；
 * 而直接构造 config 对象的测试路径拿到的是裸值。两者必须读出同一业务值，
 * 否则同一字段在不同入口会给出不同结果。
 */
export declare function readVolatile<T>(field: VolatileRef<T> | T | undefined): T | undefined;
//# sourceMappingURL=ponytail-config.d.ts.map