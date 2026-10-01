/**
 * ponytail-runtime — 移植自 hooks/ponytail-runtime.js
 *
 * flag 文件 + 多平台环境识别。
 * DSH 侧以文件为真源，保持与 Claude/Codex/Qoder 共存语义；
 * HMR 卸载时不残留句柄。
 */
export declare function isCopilot(): boolean;
export declare function isCodex(): boolean;
export declare function isQoder(): boolean;
export declare function setMode(mode: string): void;
export declare function clearMode(): void;
export declare function readMode(): string | null;
//# sourceMappingURL=ponytail-runtime.d.ts.map