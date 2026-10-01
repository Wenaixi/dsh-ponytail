/**
 * ponytail-commands — 指令解析纯函数
 *
 * 从 apply 内的 handlePromptText 抽取的解析核心，不依赖 ctx / fs / 闭包状态，
 * 便于单元测试；ponytail.ts 调用它并执行副作用（setMode/clearMode/日志）。
 */
import { isDeactivationCommand } from './ponytail-config.js';
/**
 * 解析一条用户文本中的 ponytail 指令。
 * 与既有 handlePromptText 解析逻辑完全等价：
 * - /^[/@$]ponytail/ 前缀，@/$ 归一为 /
 * - /ponytail:ponytail 与 /ponytail:ponytail-review 前缀形式
 * - 未知参数 handled=true 且不切换
 * - 非 ponytail 指令时交给 isDeactivationCommand 全句匹配
 */
export function parsePonytailCommand(text, current, getDefault) {
    const lower = String(text ?? '').trim().toLowerCase();
    if (/^[/@$]ponytail/.test(lower)) {
        const parts = lower.split(/\s+/);
        const cmd = (parts[0] ?? '').replace(/^[@$]/, '/');
        const arg = parts[1] ?? '';
        const arg2 = parts[2] ?? '';
        let mode = null;
        let isReportOnly = false;
        let persistMode = null;
        if (cmd === '/ponytail-review' || cmd === '/ponytail:ponytail-review') {
            mode = 'review';
        }
        else if (cmd === '/ponytail' || cmd === '/ponytail:ponytail') {
            if (arg === 'default') {
                persistMode = arg2;
            }
            else if (arg === 'lite')
                mode = 'lite';
            else if (arg === 'full')
                mode = 'full';
            else if (arg === 'ultra')
                mode = 'ultra';
            else if (arg === 'off')
                mode = 'off';
            else if (arg === '')
                isReportOnly = true;
            else
                return { handled: true, switched: false, unknownArg: arg };
        }
        if (persistMode !== null) {
            return { handled: true, switched: false, persistDefault: { mode: persistMode } };
        }
        if (isReportOnly) {
            return { handled: true, switched: false, reportOnly: true, mode: current ?? getDefault() };
        }
        if (mode && mode !== 'off') {
            return { handled: true, switched: true, mode };
        }
        if (mode === 'off') {
            return { handled: true, switched: true, mode: 'off' };
        }
        return { handled: true, switched: false };
    }
    if (isDeactivationCommand(lower)) {
        return { handled: true, switched: true, deactivate: true };
    }
    return { handled: false, switched: false };
}
//# sourceMappingURL=ponytail-commands.js.map