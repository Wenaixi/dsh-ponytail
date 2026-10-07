import type { PonytailState } from './ponytail-state.js';
import { type RuntimeMode } from './ponytail-config.js';
/**
 * 仅当整句为该命令时失活，避免 "add a normal mode toggle" 误触发
 * 中英文全句匹配：英文 stop ponytail / normal mode，中文 退出 ponytail / 正常模式
 * 清洗尾部中英文标点与空白符
 */
export declare function isDeactivationCommand(text: string): boolean;
/**
 * 指令解析结果（底层纯数据结构，供单元测试与内部调度使用）
 */
export interface CommandParseResult {
    handled: boolean;
    switched: boolean;
    mode?: RuntimeMode | 'review';
    deactivate?: boolean;
    reportOnly?: boolean;
    persistDefault?: {
        mode: string;
    } | null;
}
/**
 * 从单条消息 content 结构中提取纯文本
 */
export declare function extractTextFromContent(content: unknown): string;
/**
 * 从消息数组中提取并拼接纯文本
 */
export declare function extractText(messages: unknown): string;
/**
 * 解析用户输入的文本是否为 ponytail 命令
 * 移植自 hooks/ponytail-mode-tracker.js 的核心解析逻辑
 */
export declare function parsePonytailCommand(rawText: string, currentMode: string | null, getDefault: () => RuntimeMode): CommandParseResult;
export interface CommandDispatcherLogger {
    info: (msg: string) => void;
    warn?: (msg: string) => void;
    debug?: (msg: string) => void;
}
export interface CommandDispatcherEnv {
    state: PonytailState;
    logger: CommandDispatcherLogger;
    getDefaultMode?: () => RuntimeMode;
    writeDefaultMode?: (mode: string) => RuntimeMode | null;
    /** 写盘成功后同步外部默认档判定源（如 apply 的 patchMode），使命令层/UI 即时反映用户意图 */
    updateDefaultMode?: (mode: RuntimeMode) => void;
}
export interface CommandDispatchResult {
    handled: boolean;
    switched: boolean;
}
export interface CommandDispatcher {
    dispatchText: (rawText: string, sessionId?: string) => CommandDispatchResult;
    dispatchContent: (content: unknown, sessionId?: string) => CommandDispatchResult;
    dispatchMessages: (messages: unknown, sessionId?: string) => CommandDispatchResult;
}
/**
 * 创建高内聚的命令调度器深模块
 * 将文本提取、指令语法解析、状态机流转与副作用执行完整封装
 * 支持可选的 sessionId 会话作用域，实现多会话模式隔离与零缓存破坏调度
 */
export declare function createCommandDispatcher(env: CommandDispatcherEnv): CommandDispatcher;
//# sourceMappingURL=ponytail-commands.d.ts.map