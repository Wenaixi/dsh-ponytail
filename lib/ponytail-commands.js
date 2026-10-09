import { randomUUID } from 'node:crypto';
import { getDefaultMode, } from './ponytail-config.js';
import { renderModeUpdate } from './ponytail-instructions.js';
/**
 * 仅当整句为该命令时失活，避免 "add a normal mode toggle" 误触发
 * 中英文全句匹配：英文 stop ponytail / normal mode，中文 退出 ponytail / 正常模式
 * 清洗尾部中英文标点与空白符
 */
export function isDeactivationCommand(text) {
    const t = String(text ?? '').trim().toLowerCase().replace(/[.!?\s。！？]+$/, '');
    return t === 'stop ponytail' || t === 'normal mode' || t === '退出 ponytail' || t === '正常模式';
}
/**
 * 从单条消息 content 结构中提取纯文本
 */
export function extractTextFromContent(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .filter((b) => typeof b?.text === 'string')
            .map((b) => b.text)
            .join('\n');
    }
    return '';
}
/**
 * 从消息数组中提取并拼接纯文本
 */
export function extractText(messages) {
    if (!Array.isArray(messages))
        return '';
    return messages
        .map((m) => extractTextFromContent(m?.content))
        .filter(Boolean)
        .join('\n')
        .trim();
}
/**
 * 解析用户输入的文本是否为 ponytail 命令
 * 移植自 hooks/ponytail-mode-tracker.js 的核心解析逻辑
 */
export function parsePonytailCommand(rawText, currentMode, getDefault) {
    const text = String(rawText ?? '').trim();
    const lower = text.toLowerCase();
    // 1. 全句失活指令
    if (isDeactivationCommand(lower)) {
        return { handled: true, switched: true, deactivate: true };
    }
    // 2. 指令前缀匹配：统一处理 /、@、$ 以及 :ponytail 前缀
    const match = text.match(/^[/@$](?:ponytail:)?(ponytail(?:-[a-z]+)?)(?:\s+(.*))?$/i);
    if (!match)
        return { handled: false, switched: false };
    const cmd = match[1].toLowerCase();
    const arg = (match[2] ?? '').trim().toLowerCase();
    if (cmd === 'ponytail-review') {
        return { handled: true, switched: true, mode: 'review' };
    }
    if (cmd === 'ponytail') {
        if (arg === 'off') {
            return { handled: true, switched: true, mode: 'off' };
        }
        if (arg === 'lite' || arg === 'full' || arg === 'ultra') {
            return { handled: true, switched: true, mode: arg };
        }
        if (arg.startsWith('default')) {
            const targetMode = arg.replace(/^default\s*/, '').trim();
            return {
                handled: true,
                switched: false,
                persistDefault: { mode: targetMode },
            };
        }
        if (!arg) {
            // 裸 /ponytail 仅报告当前等级，不切换
            return {
                handled: true,
                switched: false,
                reportOnly: true,
                mode: currentMode ?? getDefault(),
            };
        }
        // 未知参数：对齐上游 mode-tracker 的 else 兜底切默认等级
        return { handled: true, switched: true, mode: getDefault() };
    }
    return { handled: false, switched: false };
}
/**
 * 创建高内聚的命令调度器深模块
 * 将文本提取、指令语法解析、状态机流转与副作用执行完整封装
 * 支持可选的 sessionId 会话作用域，实现多会话模式隔离与零缓存破坏调度
 */
export function createCommandDispatcher(env) {
    // 读归优先级链（宿主注入的综合判定源优先，实时感知环境变量与易失引用），写归持久通道接缝（sink 优先）
    const getDef = env.getDefaultMode ?? (env.sink ? (() => env.sink.readDefaultMode()) : getDefaultMode);
    const writeDef = env.sink
        ? ((mode) => env.sink.writeDefaultMode(mode))
        : (env.writeDefaultMode ?? ((mode) => env.state.set(mode)));
    function dispatchText(rawText, sessionId) {
        const text = String(rawText ?? '').trim();
        const currentMode = (sessionId && typeof env.state.getSession === 'function')
            ? env.state.getSession(sessionId).effectiveMode
            : env.state.get();
        const result = parsePonytailCommand(text, currentMode, getDef);
        if (!result.handled)
            return { handled: false, switched: false };
        const applySessionMode = (m) => {
            if (typeof env.state.setSessionMode === 'function') {
                env.state.setSessionMode(sessionId, m);
            }
            else {
                env.state.set(m);
            }
        };
        if (result.deactivate || result.mode === 'off') {
            applySessionMode(null);
            env.logger.info(result.deactivate ? `[ponytail] 已通过指令退出：${text}` : '[ponytail] 已关闭');
            return { handled: true, switched: true };
        }
        if (result.persistDefault) {
            const targetMode = result.persistDefault.mode;
            if (targetMode === 'off' || targetMode === 'lite' || targetMode === 'full' || targetMode === 'ultra') {
                const written = writeDef(targetMode);
                env.logger.info(`[ponytail] 默认等级已持久化：${written}`);
                // 用户最新意图即时生效：同步外部判定源（apply 的 patchMode）
                env.updateDefaultMode?.(targetMode);
                // 关键：全局修改配置时，同步更新所有已有会话的 effectiveMode，
                // 但严禁修改已有会话的 baselineMode，确保已有会话在下轮自动通过尾部追加通知生效！
                if (typeof env.state.syncGlobalModeToSessions === 'function') {
                    env.state.syncGlobalModeToSessions(targetMode);
                }
                else {
                    env.state.set(targetMode);
                }
            }
            return { handled: true, switched: true };
        }
        // ponytail: 严格内聚时序：reportOnly 必须先于 mode 分支判断，防止裸 /ponytail 误判切档
        if (result.reportOnly) {
            env.logger.info(`[ponytail] 当前等级：${result.mode}`);
            return { handled: true, switched: false };
        }
        if (result.mode) {
            applySessionMode(result.mode);
            env.logger.info(`[ponytail] 已切换 — 等级：${result.mode}`);
            return { handled: true, switched: true };
        }
        return { handled: true, switched: false };
    }
    return {
        dispatchText,
        dispatchContent(content, sessionId) {
            const text = extractTextFromContent(content);
            return text ? dispatchText(text, sessionId) : { handled: false, switched: false };
        },
        dispatchMessages(messages, sessionId) {
            const text = extractText(messages);
            return text ? dispatchText(text, sessionId) : { handled: false, switched: false };
        },
    };
}
/** 统一从多层级宿主上下文对象中安全提取会话 ID */
export function resolveSessionId(target) {
    const t = target;
    return t?.agent?.session?.id ?? t?.scope?.session?.id ?? t?.session?.id;
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
export function createTurnCoordinator(env) {
    const dispatcher = createCommandDispatcher(env);
    async function handlePreStep(payload, next) {
        const raw = payload;
        const sessionId = resolveSessionId(payload);
        // 1. 尝试解析并分发指令
        try {
            if (raw?.messages) {
                dispatcher.dispatchMessages(raw.messages, sessionId);
            }
        }
        catch (err) {
            env.logger.warn?.(`[ponytail] agent/pre-step 处理失败（仍会调用 next()，不拦截请求）：${String(err)}`);
        }
        // 2. 必须且只能穿透下游 waterfall（断链守卫）
        const downstream = (await next());
        if (!downstream || typeof downstream !== 'object' || downstream.kind !== 'enter') {
            return downstream;
        }
        const decision = downstream;
        // 3. 变动检测与原子发射标记（深模块原子事务接缝，消除两步时序外泄）
        const transition = env.state.consumeSessionTransition(sessionId);
        if (transition.changed) {
            const noticeText = renderModeUpdate(transition.effectiveMode, transition.previousMode, env.skillDir);
            const updateMsg = {
                id: randomUUID(),
                role: 'user',
                content: [{ type: 'text', text: noticeText }],
                source: {
                    kind: 'ponytail-mode-update',
                    mode: transition.effectiveMode,
                    previousMode: transition.previousMode,
                },
            };
            // 4. 原地替换或追加（严守单通知幂等不变量，对齐 dsh-tool-skill）
            const msgs = Array.isArray(decision.messages) ? [...decision.messages] : [];
            const existingIdx = msgs.findIndex((m) => Boolean(m && typeof m === 'object' && m.source?.kind === 'ponytail-mode-update'));
            if (existingIdx !== -1) {
                msgs[existingIdx] = updateMsg;
            }
            else {
                msgs.push(updateMsg);
            }
            return {
                ...decision,
                messages: msgs,
            };
        }
        return decision;
    }
    function handleSessionEvent(session, event) {
        try {
            const ev = event;
            if (ev?.type !== 'user/message')
                return;
            const sessionId = session?.id;
            dispatcher.dispatchContent(ev.data?.content, sessionId);
        }
        catch (err) {
            env.logger.warn?.(`[ponytail] session/event 处理失败：${String(err)}`);
        }
    }
    return {
        handlePreStep,
        handleSessionEvent,
    };
}
//# sourceMappingURL=ponytail-commands.js.map