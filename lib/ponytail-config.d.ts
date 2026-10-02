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
export declare const DEFAULT_MODE = "full";
export declare const VALID_MODES: readonly ["off", "lite", "full", "ultra", "review"];
export declare const RUNTIME_MODES: readonly ["off", "lite", "full", "ultra"];
export type RuntimeMode = (typeof RUNTIME_MODES)[number];
export type ValidMode = (typeof VALID_MODES)[number];
export declare function normalizeMode(mode: string): RuntimeMode | null;
export declare function normalizeConfigMode(mode: string): ValidMode | null;
export declare function isDeactivationCommand(text: string): boolean;
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
export declare function getConfigDir(): string;
export declare function getConfigPath(): string;
/**
 * 迁移前的旧配置路径（4.10.0-dsh.4 及以前使用的宿主平台约定位置）。
 *
 * 仅用于一次性兼容读取：老用户升级后，新位置尚未生成时回退读取旧配置，
 * 避免已自定义的等级/技能开关静默丢失。写入永远只写新位置，
 * 旧目录不删除也不改写，数据所有权保持清晰。
 * ponytail: 兼容读取保留至下一个大版本（5.x 首发）后移除，届时可整段删除。
 */
export declare function getLegacyConfigDir(): string | null;
export declare function getLegacyConfigPath(): string | null;
/**
 * 读取配置文件原文：新位置优先，缺失时一次性回退旧位置。
 * 返回 null 表示两处都不存在或均不可读。
 */
export declare function readConfigFileText(): string | null;
export declare function getDefaultMode(): RuntimeMode;
export interface FullConfigData {
    defaultMode: RuntimeMode;
    disabledSkills: string[];
}
export declare function readFullConfig(): FullConfigData;
export declare function writeFullConfig(patch: Partial<FullConfigData>): FullConfigData | null;
export declare function resetFullConfig(): FullConfigData | null;
export declare function writeDefaultMode(mode: string): RuntimeMode | null;
/**
 * 插件配置（entry 与 skill provider 共享，避免 ponytail-skills 反向导入 entry 造成循环依赖）
 * 默认值写 schema（Schemastery），review 不可作默认（#377）
 */
export interface PonytailConfig {
    /** 禁用的技能名称列表 */
    disabledSkills?: string[];
    /** 注册到 ctx.skills 的 provider 名称 */
    providerName?: string;
    /** skill 目录绝对路径，默认取包内 skills/ */
    skillDir?: string;
    /** 默认强度，off 则不自动激活 */
    defaultMode?: 'off' | 'lite' | 'full' | 'ultra';
}
//# sourceMappingURL=ponytail-config.d.ts.map