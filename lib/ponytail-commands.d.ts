import type { PonytailState } from './ponytail-state.js';
import { type RuntimeMode } from './ponytail-config.js';
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
}
export interface CommandDispatchResult {
    handled: boolean;
    switched: boolean;
}
export interface CommandDispatcher {
    dispatchText: (rawText: string) => CommandDispatchResult;
    dispatchContent: (content: unknown) => CommandDispatchResult;
    dispatchMessages: (messages: unknown) => CommandDispatchResult;
}
/**
 * 创建高内聚的命令调度器深模块
 * 将文本提取、指令语法解析、状态机流转与副作用执行完整封装
 */
export declare function createCommandDispatcher(env: CommandDispatcherEnv): CommandDispatcher;
//# sourceMappingURL=ponytail-commands.d.ts.map