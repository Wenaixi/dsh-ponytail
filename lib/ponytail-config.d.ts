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
export declare function normalizePersistedMode(mode: string): RuntimeMode | ValidMode | null;
export declare function isDeactivationCommand(text: string): boolean;
export declare function isShellSafe(p: string): boolean;
export declare function getConfigDir(): string;
export declare function getConfigPath(): string;
export declare function getClaudeDir(): string;
export declare function getDefaultMode(): RuntimeMode;
export declare function getHideStatus(): boolean;
export declare function getQuietStartup(): boolean;
export declare function writeDefaultMode(mode: string): RuntimeMode | null;
//# sourceMappingURL=ponytail-config.d.ts.map