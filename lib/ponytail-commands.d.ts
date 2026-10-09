import type { PonytailState } from './ponytail-state.js';
import { type RuntimeMode } from './ponytail-config.js';
import type { PonytailConfigSink } from './ponytail-settings.js';
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
    /** 官方配置持久化通道接缝（统一经此流转，遵守 profile 补丁与文件回退一致性） */
    sink?: PonytailConfigSink;
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
/** 统一从多层级宿主上下文对象中安全提取会话 ID */
export declare function resolveSessionId(target: unknown): string | undefined;
export interface TurnCoordinatorEnv extends CommandDispatcherEnv {
    skillDir: string;
}
export interface TurnCoordinator {
    handlePreStep(payload: unknown, next: () => Promise<unknown>): Promise<unknown>;
    handleSessionEvent(session: unknown, event: unknown): void;
}
/**
 * 轮次生命周期协作者深模块 (TurnCoordinator)
 *
 * 核心架构杠杆：
 * 将用户指令解析、会话状态机流转、宿主 waterfall 穿透、变动对比、
 * <system-reminder> 瞬态提醒构造、单轮原地替换与已发射标记回写完整内聚于此。
 *
 * 严守 6 大不变量：
 * 1. Waterfall 不断链（异常捕获并穿透）；
 * 2. KV Cache 保护（顶层基线不可变，所有动态变动收敛在当前轮次尾部）；
 * 3. 单通知幂等（同轮重试时原地替换，绝不重复 push）；
 * 4. 发射标记收敛时机（仅在 downstream.kind === 'enter' 后标记已发射）；
 * 5. 多会话隔离（基于 sessionId 独立闭环）；
 * 6. 纯命令只读安全（裸 /ponytail 无副作用）。
 */
export declare function createTurnCoordinator(env: TurnCoordinatorEnv): TurnCoordinator;
//# sourceMappingURL=ponytail-commands.d.ts.map