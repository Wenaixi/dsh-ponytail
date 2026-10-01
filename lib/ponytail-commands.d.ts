/**
 * ponytail-commands — 指令解析纯函数
 *
 * 从 apply 内的 handlePromptText 抽取的解析核心，不依赖 ctx / fs / 闭包状态，
 * 便于单元测试；ponytail.ts 调用它并执行副作用（setMode/clearMode/日志）。
 */
export interface CommandParseResult {
    handled: boolean;
    switched: boolean;
    /** 各分支语义（与上游 mode-tracker 的局部量 1:1 投影，勿加判别字段双编码）：
     *  switch=目标等级（lite/full/ultra/off/review）；report=报告值（current ?? default）；
     *  persist=待持久化等级；deactivate=全句失活。 */
    mode?: string;
    /** stop ponytail / normal mode 等全句失活 */
    deactivate?: boolean;
    /** 裸 /ponytail 仅报告当前等级，不切换 */
    reportOnly?: boolean;
    /** /ponytail default <mode> 持久化默认等级 */
    persistDefault?: {
        mode: string;
    } | null;
}
/**
 * 解析一条用户文本中的 ponytail 指令。
 * 与上游 hooks/ponytail-mode-tracker.js（4.10.0）逐分支一致：
 * - /^[/@$]ponytail/ 前缀，@/$ 归一为 /
 * - /ponytail:ponytail 与 /ponytail:ponytail-review 前缀形式
 * - 未知参数走上游 else 兜底：切到默认等级（静默幂等，与上游一致）
 * - 非 ponytail 指令时交给 isDeactivationCommand 全句匹配
 */
export declare function parsePonytailCommand(text: string, current: string | null, getDefault: () => string): CommandParseResult;
//# sourceMappingURL=ponytail-commands.d.ts.map