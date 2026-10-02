/**
 * ponytail-runtime — DSH 单一宿主 flag 存取
 *
 * 本插件仅面向 DeepSeek Harness（DSH）运行，不识别也不兼容
 * Copilot / Codex / Qoder / Claude Code 等外部宿主（见 docs/adr/0004）。
 * flag 文件（.ponytail-active）固定持久化于 DSH 统一用户数据根目录
 * $DSH_HOME/ponytail（默认 ~/.dsh/ponytail，见 docs/adr/0005），与 config.json
 * 同源，/ponytail 切换在 DSH 内闭环。
 */
export declare function setMode(mode: string): void;
export declare function clearMode(): void;
export declare function readMode(): string | null;
//# sourceMappingURL=ponytail-runtime.d.ts.map