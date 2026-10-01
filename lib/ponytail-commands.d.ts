/**
 * ponytail-commands — 指令解析纯函数
 *
 * 从 apply 内的 handlePromptText 抽取的解析核心，不依赖 ctx / fs / 闭包状态，
 * 便于单元测试；ponytail.ts 调用它并执行副作用（setMode/clearMode/日志）。
 */
export interface CommandParseResult {
    handled: boolean;
    switched: boolean;
    /** 切换到该等级（'lite' | 'full' | 'ultra' | 'off' | 'review'）；null 表示 off */
    mode?: string | null;
    /** stop ponytail / normal mode 等全句失活 */
    deactivate?: boolean;
    /** 裸 /ponytail 仅报告当前等级，不切换 */
    reportOnly?: boolean;
    /** /ponytail default <mode> 持久化默认等级 */
    persistDefault?: {
        mode: string;
    } | null;
    /** 未知参数（副作用层负责 warn，不切换） */
    unknownArg?: string;
}
/**
 * 解析一条用户文本中的 ponytail 指令。
 * 与既有 handlePromptText 解析逻辑完全等价：
 * - /^[/@$]ponytail/ 前缀，@/$ 归一为 /
 * - /ponytail:ponytail 与 /ponytail:ponytail-review 前缀形式
 * - 未知参数 handled=true 且不切换
 * - 非 ponytail 指令时交给 isDeactivationCommand 全句匹配
 */
export declare function parsePonytailCommand(text: string, current: string | null, getDefault: () => string): CommandParseResult;
//# sourceMappingURL=ponytail-commands.d.ts.map