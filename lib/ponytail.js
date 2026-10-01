/**
 * dsh-ponytail — DSH 完整移植版 ponytail (dietrichgebert/ponytail 4.10.0)
 *
 * 能力全集：
 * - always-on 梯子注入（systemPrompt section，随 mode 动态裁剪）
 * - 6 个 skill：ponytail / ponytail-review / ponytail-audit / ponytail-debt / ponytail-gain / ponytail-help
 * - 完整复刻 hooks 行为：activate / mode-tracker / subagent / config / instructions / runtime
 * - 不注册任何 tool，全部能力经 Skill 暴露
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Schema from '@deepseek-ai/schemastery';
import { DEFAULT_MODE, getDefaultMode, isShellSafe, normalizeMode, writeDefaultMode, } from './ponytail-config.js';
import { createCommandDispatcher } from './ponytail-commands.js';
import { render } from './ponytail-instructions.js';
import { createPonytailState } from './ponytail-state.js';
import { PonytailProvider } from './ponytail-skills.js';
export const Config = Schema.object({
    providerName: Schema.string().default('ponytail'),
    skillDir: Schema.string(),
    defaultMode: Schema.union(['off', 'lite', 'full', 'ultra']).default('full'),
});
// ---------------------------------------------------------------------------
// 插件元信息
// ---------------------------------------------------------------------------
export const name = 'ponytail';
export const inject = ['skills', 'systemPrompt'];
// ---------------------------------------------------------------------------
// 工具函数（与 superpowers 同款健壮版）
// ---------------------------------------------------------------------------
function resolveDefaultSkillDir(configSkillDir) {
    if (configSkillDir)
        return resolve(configSkillDir);
    try {
        const here = fileURLToPath(import.meta.url);
        return resolve(dirname(here), '..', 'skills');
    }
    catch {
        return resolve('skills');
    }
}
// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------
export function apply(ctx, config = {}) {
    const rawConfig = config;
    const resolved = {
        providerName: rawConfig['providerName'] ?? 'ponytail',
        ...(rawConfig['skillDir'] !== undefined ? { skillDir: rawConfig['skillDir'] } : {}),
        defaultMode: rawConfig['defaultMode'] ?? DEFAULT_MODE,
    };
    // 优先级：PONYTAIL_DEFAULT_MODE env > cordis config 的 defaultMode（显式）> 配置文件 > full
    // 与上游 ponytail-config.js 的 getDefaultMode(env > file > full) 保持一致，
    // 但 cordis 显式配置应夹在 env 与 file 之间
    const envRaw = process.env['PONYTAIL_DEFAULT_MODE'];
    const envMode = envRaw ? normalizeMode(envRaw) : null;
    if (envRaw && !envMode) {
        // ponytail: env 非法值静默回退与上游一致，此处 warn 为 DSH 差分（不改变回退语义），便于定位配置错误
        ctx.logger.warn(`[ponytail] PONYTAIL_DEFAULT_MODE 值无效（回退后续来源）：${envRaw}`);
    }
    let initialMode;
    if (envMode) {
        initialMode = envMode;
    }
    else if (rawConfig['defaultMode'] !== undefined) {
        initialMode = resolved.defaultMode;
    }
    else {
        initialMode = getDefaultMode();
    }
    const skillDir = resolveDefaultSkillDir(resolved.skillDir);
    // 等级状态唯一归属：get()/set()/syncFromFile() 三方法，闭包态随 HMR 重建
    const state = createPonytailState();
    state.set(initialMode === 'off' ? null : initialMode);
    if (state.get()) {
        ctx.logger.info(`[ponytail] 已激活 — 等级：${state.get()}（skillDir: ${skillDir}）`);
    }
    else {
        ctx.logger.info('[ponytail] 已关闭 — 直到 /ponytail 再次激活前不注入');
    }
    if (skillDir && !isShellSafe(skillDir)) {
        ctx.logger.warn(`[ponytail] skillDir 包含 shell 元字符，请检查路径：${skillDir}`);
    }
    // SkillProvider 注册：深模块构造函数接收已解析的 providerName 与 skillDir（优先级归 entry）
    const skills = ctx.skills;
    skills.registerProvider((control) => new PonytailProvider(ctx, control, { providerName: resolved.providerName ?? 'ponytail', skillDir }));
    // 类型不安全的事件监听通过 any 绕过，运行时由 cordis 校验
    const anyCtx = ctx;
    anyCtx.on('skills/change', (..._args) => {
        ctx.logger.debug('[ponytail] 技能目录已变更');
    });
    // Always-on 注入：systemPrompt section，order 50 位于 persona(0) 之后
    const systemPrompt = ctx.systemPrompt;
    systemPrompt.section({
        name: 'ponytail',
        order: 50,
        text: () => {
            // 文件优先：每次注入前拉齐 flag 与内存（外部改 flag 在此收敛）
            try {
                state.syncFromFile();
            }
            catch {
                // ignore
            }
            const mode = state.get();
            if (!mode || mode === 'off')
                return ''; // off = 不注入，属 section 职责，不进 render
            return render(skillDir, mode);
        },
    });
    // 命令调度器深模块：收敛文本提取、指令语法解析、状态机流转与宿主日志
    const dispatcher = createCommandDispatcher({
        state,
        logger: ctx.logger,
        getDefaultMode,
        writeDefaultMode,
    });
    // 监听 agent/pre-step waterfall：模型请求前的最后拦截点（对齐上游 UserPromptSubmit）
    // 必须 return next()，否则短路下游
    anyCtx.on('agent/pre-step', async (...args) => {
        const [payload, next] = args;
        try {
            dispatcher.dispatchMessages(payload?.messages);
        }
        catch (err) {
            // best-effort：与 session/event 同一防御策略，失败可见（坏订阅者不断链）
            ctx.logger.warn(`[ponytail] agent/pre-step 处理失败（仍会调用 next()，不拦截请求）：${String(err)}`);
        }
        return (await next());
    });
    // 同时监听 session/event 的 user/message，覆盖 inject 等非 pre-step 路径
    // defensive-patterns：坏订阅者不得断链核心生命周期，整体 try/catch 不抛出
    anyCtx.on('session/event', (...args) => {
        try {
            const [_session, event] = args;
            if (event?.type !== 'user/message')
                return;
            dispatcher.dispatchContent(event.data?.content);
        }
        catch (err) {
            ctx.logger.warn(`[ponytail] session/event 处理失败：${String(err)}`);
        }
    });
    // 子 agent 注入：对齐 ponytail-subagent.js 的 PONYTAIL_SUBAGENT_MATCHER
    const subagentMatcherEnv = process.env['PONYTAIL_SUBAGENT_MATCHER'];
    let subagentRe = null;
    if (subagentMatcherEnv) {
        try {
            subagentRe = new RegExp(subagentMatcherEnv, 'i');
        }
        catch {
            subagentRe = null;
            ctx.logger.warn(`[ponytail] PONYTAIL_SUBAGENT_MATCHER 正则无效：${subagentMatcherEnv}`);
        }
    }
    // agent/created 双职责：子智能体日志 + 会话启动对齐（补位已下线的事件）
    // 官方 payload 签名 { agent: Agent; source: SessionStartSource; signal?: AbortSignal }（dsh-agent runtime-types 已核实），
    // source 仅 startup|resume 触发对齐，clear|compact 不动作；本监听整体包 try/catch（agent/created 为 serial 模式，坏监听器会失败整个 agent 创建）
    anyCtx.on('agent/created', (...args) => {
        try {
            const [payload] = args;
            if (subagentRe) {
                ctx.logger.debug(`[ponytail] 子智能体已创建：${String(payload.agent.id)} — 匹配器：${subagentMatcherEnv}`);
            }
            if (payload.source === 'startup' || payload.source === 'resume') {
                // 会话启动镜像 flag：set() 已归一 off→null，无需再镜像
                const mode = state.get();
                state.set(mode);
                ctx.logger.debug(`[ponytail] 会话启动（${payload.source}）— 等级：${mode}`);
            }
        }
        catch (err) {
            ctx.logger.warn(`[ponytail] agent/created 处理失败：${String(err)}`);
        }
    });
    // 清理：HMR 卸载时自动通过 ctx 逆序清理所有注册；额外标记
    ctx.effect(() => {
        return () => {
            ctx.logger.info('[ponytail] 已卸载 — provider 与 prompt 段已移除');
        };
    });
}
export default { name, inject, Config, apply };
//# sourceMappingURL=ponytail.js.map