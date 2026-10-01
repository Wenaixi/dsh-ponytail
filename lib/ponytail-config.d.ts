/**
 * ponytail-config — 移植自 hooks/ponytail-config.js
 *
 * 三级默认解析：环境变量 > 配置文件 > full
 * 保留上游全部边界与兼容行为：
 * - review 不可作默认 (#377)
 * - isDeactivationCommand 全句匹配
 * - isShellSafe 仅白名单路径字符
 * - BOM 去除、config 文件容错
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
export declare function getConfigDir(): string;
export declare function getConfigPath(): string;
export declare function getDefaultMode(): RuntimeMode;
export declare function writeDefaultMode(mode: string): RuntimeMode | null;
/**
 * 插件配置（entry 与 skill provider 共享，避免 ponytail-skills 反向导入 entry 造成循环依赖）
 * 默认值写 schema（Schemastery），review 不可作默认（#377）
 */
export interface PonytailConfig {
    /** 注册到 ctx.skills 的 provider 名称 */
    providerName?: string;
    /** skill 目录绝对路径，默认取包内 skills/ */
    skillDir?: string;
    /** 默认强度，off 则不自动激活 */
    defaultMode?: 'off' | 'lite' | 'full' | 'ultra';
}
//# sourceMappingURL=ponytail-config.d.ts.map