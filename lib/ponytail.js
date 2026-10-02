/**
 * dsh-ponytail — DSH 完整移植版 ponytail (dietrichgebert/ponytail 4.10.0)
 *
 * 能力全集：
 * - always-on 梯子注入（systemPrompt section，随 mode 动态裁剪）
 * - 6 个 skill：ponytail / ponytail-review / ponytail-audit / ponytail-debt / ponytail-gain / ponytail-help
 * - 完整复刻 hooks 行为：activate / mode-tracker / subagent / config / instructions / runtime
 * - 不注册任何 tool，全部能力经 Skill 暴露
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Schema from '@deepseek-ai/schemastery';
import { DEFAULT_MODE, getDefaultMode, isShellSafe, normalizeMode, readConfigFileText, writeDefaultMode, } from './ponytail-config.js';
import { resolvePriority } from './ponytail-priority.js';
import { createCommandDispatcher } from './ponytail-commands.js';
import { render } from './ponytail-instructions.js';
import { createPonytailState } from './ponytail-state.js';
import { PonytailProvider } from './ponytail-skills.js';
export const Config = Schema.object({
    providerName: Schema.string().default('ponytail'),
    skillDir: Schema.string(),
    // 注意：不给 defaultMode 设 Schema 默认值——Cordis 校验会把缺省 fill 成显式配置，
    // 从而 shadow 掉 config.json 的 defaultMode 档（上游 env > config > full 语义）；
    // 缺省时由 apply 走 getDefaultMode()（env > config 文件 > full）并 ?? DEFAULT_MODE
    defaultMode: Schema.union(['off', 'lite', 'full', 'ultra']),
});
// ---------------------------------------------------------------------------
// 插件元信息
// ---------------------------------------------------------------------------
export const name = 'ponytail';
export const inject = ['skills', 'systemPrompt', 'webServer'];
// ---------------------------------------------------------------------------
// 工具函数（与 superpowers 同款健壮版）
// ---------------------------------------------------------------------------
function resolveDefaultSkillDir(configSkillDir) {
    if (configSkillDir)
        return resolve(configSkillDir);
    try {
        return fileURLToPath(new URL('../skills', import.meta.url));
    }
    catch {
        return resolve('skills');
    }
}
// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------
export function apply(ctx, config = {}) {
    let providerInstance = null;
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
    // 会话启动对齐（对齐上游 ponytail-activate.js SessionStart 语义）：
    // 每次会话启动都按 getDefaultMode()（env > config 文件 > full）重写 flag，
    // 因此 /ponytail <档> 只在本会话生效，跨会话持久化必须用 /ponytail default <档>。
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
                state.syncToFile();
                ctx.logger.debug(`[ponytail] 会话启动（${payload.source}）— 镜像 flag 等级：${state.get()}`);
            }
        }
        catch (err) {
            ctx.logger.warn(`[ponytail] agent/created 处理失败：${String(err)}`);
        }
    });
    // ---------------------------------------------------------------------------
    // Web GUI 配置端点：为插件管理面板提供配置查询与修改 API
    // ---------------------------------------------------------------------------
    const invalidateSkills = () => {
        if (providerInstance) {
            try {
                providerInstance.invalidate();
            }
            catch {
                // 忽略异常
            }
        }
    };
    // 使用 Cordis 响应式服务注入：当 webServer 服务就绪时安全注册路由（防御性兼容轻量 mock ctx）
    // Web 配置端点挂载
    if (ctx.webServer) {
        ctx.effect(() => {
            ctx.logger.info('[ponytail] Web 配置端点已就绪: /api/plugins/ponytail/config');
            return ctx.webServer.register({
                kind: 'exact',
                path: '/api/plugins/ponytail/config',
                handler: async (req, res) => {
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-store');
                    // 读取 config.json 的 defaultMode 原始值：区分「字段缺失」与「文件损坏」交给诊断链统一标注
                    const readRawConfigMode = () => {
                        try {
                            const raw = readConfigFileText();
                            if (raw === null)
                                return undefined;
                            const parsed = JSON.parse(raw);
                            const dm = parsed['defaultMode'];
                            return typeof dm === 'string' ? dm : undefined;
                        }
                        catch {
                            return undefined;
                        }
                    };
                    const rawSkillsMeta = [
                        { id: 'ponytail', name: 'ponytail', description: '懒人模式本体：3 档强度，梯子七阶注入' },
                        { id: 'ponytail-review', name: 'ponytail-review', description: '过度设计评审：只挑能删的代码，一行一条' },
                        { id: 'ponytail-audit', name: 'ponytail-audit', description: '全仓过度设计审计：按可删行数降序猎取臃肿' },
                        { id: 'ponytail-debt', name: 'ponytail-debt', description: '债务台账收割：收割所有 ponytail: 注释，建立债务台账' },
                        { id: 'ponytail-gain', name: 'ponytail-gain', description: '收益看板：展示 benchmark 中位数收益' },
                        { id: 'ponytail-help', name: 'ponytail-help', description: '速查卡：模式、技能、命令与配置速查' },
                    ];
                    if (req.method === 'GET') {
                        const currentMode = state.get() ?? 'off';
                        const defaultMode = getDefaultMode();
                        const disabledSkills = state.getDisabledSkills();
                        const skillsList = rawSkillsMeta.map((s) => ({
                            ...s,
                            enabled: state.isSkillEnabled(s.id),
                        }));
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            currentMode,
                            defaultMode,
                            disabledSkills,
                            skills: skillsList,
                            priority: resolvePriority({
                                envRaw: process.env['PONYTAIL_DEFAULT_MODE'],
                                patchMode: rawConfig['defaultMode'],
                                configMode: readRawConfigMode(),
                            }),
                        }));
                        return;
                    }
                    if (req.method === 'POST') {
                        let bodyStr = '';
                        for await (const chunk of req) {
                            bodyStr += chunk;
                        }
                        let payload = {};
                        try {
                            if (bodyStr)
                                payload = JSON.parse(bodyStr);
                        }
                        catch {
                            res.writeHead(400);
                            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                            return;
                        }
                        // 一键恢复默认配置 (神秘需求 Q4)
                        if (payload.action === 'reset') {
                            state.resetToDefaults();
                            invalidateSkills();
                            ctx.logger.info('[ponytail] UI 一键重置为默认配置（full 等级，开启所有技能）');
                        }
                        else {
                            // 修改等级 (2B 全局持久化与即时生效)
                            if (typeof payload.mode === 'string') {
                                const targetMode = payload.mode.toLowerCase();
                                state.setDefaultMode(targetMode);
                                state.set(targetMode === 'off' ? null : targetMode);
                                ctx.logger.info(`[ponytail] UI 切换运行等级：${targetMode}（已持久化为默认等级）`);
                            }
                            // 修改禁用的技能列表 (3A 物理隐藏)
                            if (Array.isArray(payload.disabledSkills)) {
                                const newDisabled = payload.disabledSkills.filter((s) => typeof s === 'string');
                                state.setDisabledSkills(newDisabled);
                                if (newDisabled.includes('ponytail')) {
                                    state.set(null);
                                }
                                invalidateSkills();
                                ctx.logger.info(`[ponytail] UI 更新禁用技能列表：${JSON.stringify(newDisabled)}`);
                            }
                            // 切换单个技能
                            if (typeof payload.toggleSkill === 'object' && payload.toggleSkill !== null) {
                                const tg = payload.toggleSkill;
                                if (typeof tg.name === 'string') {
                                    state.toggleSkill(tg.name, tg.enabled);
                                    if (tg.name === 'ponytail' && tg.enabled === false) {
                                        state.set(null);
                                    }
                                    invalidateSkills();
                                    ctx.logger.info(`[ponytail] UI 切换技能 ${tg.name} 状态：${tg.enabled}`);
                                }
                            }
                        }
                        const currentMode = state.get() ?? 'off';
                        const defaultMode = getDefaultMode();
                        const disabledSkills = state.getDisabledSkills();
                        const skillsList = rawSkillsMeta.map((s) => ({
                            ...s,
                            enabled: state.isSkillEnabled(s.id),
                        }));
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            success: true,
                            currentMode,
                            defaultMode,
                            disabledSkills,
                            skills: skillsList,
                            priority: resolvePriority({
                                envRaw: process.env['PONYTAIL_DEFAULT_MODE'],
                                patchMode: rawConfig['defaultMode'],
                                configMode: readRawConfigMode(),
                            }),
                        }));
                        return;
                    }
                    res.writeHead(405);
                    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
                },
            });
        }, 'ponytail: web route');
    }
    // 清理：HMR 卸载时自动通过 ctx 逆序清理所有注册；额外标记
    ctx.effect(() => {
        return () => {
            ctx.logger.info('[ponytail] 已卸载 — provider 与 prompt 段已移除');
        };
    });
}
export default { name, inject, Config, apply };
//# sourceMappingURL=ponytail.js.map