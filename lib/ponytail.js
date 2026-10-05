/**
 * dsh-ponytail — 面向 DSH 的 Ponytail 适配实现（上游参考版本独立记录于 README）
 *
 * 能力全集：
 * - always-on 梯子注入（systemPrompt section，随 mode 动态裁剪）
 * - 6 个 skill：ponytail / ponytail-review / ponytail-audit / ponytail-debt / ponytail-gain / ponytail-help
 * - 对应 DSH 生命周期接线：activate / mode-tracker / subagent / config / instructions / runtime
 * - 不注册任何 tool，全部能力经 Skill 暴露
 */
import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Schema from '@deepseek-ai/schemastery';
import { getSharedConfigPath, isShellSafe, normalizeMode, readFullConfig, readVolatile, } from './ponytail-config.js';
import { createFileSink, createSettingsSink, migrateLegacyConfig, } from './ponytail-settings.js';
import { resolvePriority } from './ponytail-priority.js';
import { createCommandDispatcher } from './ponytail-commands.js';
import { renderPromptSection } from './ponytail-instructions.js';
import { createDiskStorage, createPonytailState } from './ponytail-state.js';
import { PonytailProvider } from './ponytail-skills.js';
import { PonytailRemote } from './ponytail-remote.js';
// Config 的类型标注交给 schemastery 推断：PonytailConfig 里两个可持久化字段已是
// VolatileRef 形状，手动标注反而会让 TS 在 meta.default 上做无意义的交叉比对。
export const Config = Schema.object({
    providerName: Schema.string().default('ponytail'),
    skillDir: Schema.string(),
    // 注意：不给 defaultMode 设 Schema 默认值——Cordis 校验会把缺省 fill 成显式配置，
    // 从而 shadow 掉 config.json 的 defaultMode 档；缺省时由 apply 走
    // resolvePriority()（env > patch > config 文件 > full，见 ponytail-priority.ts）
    //
    // volatile 声明的含义是「改了不必重挂载」：宿主 loader 收到新值后就地提交到本进程的引用
    // 并派发 loader/volatile-update（cordis-plugin-loader/lib/index.js:393-425），
    // 写入经 settings 落到 profile 补丁，重启后由 Cordis 解析回同一组 volatile 引用。
    // union 自身可以 volatile：schemastery 只禁止「volatile 字段嵌在 union 分支 / 数组元素 / dict 内」
    // （schemastery/lib/index.mjs:241-252），顶层固定对象路径上的 union 是允许的。
    defaultMode: Schema.union(['off', 'lite', 'full', 'ultra']).volatile(),
    // 技能禁用列表此前只存在 config.json（HTTP 端点专属）。迁入 Config 后由官方表单承载，
    // 获得 revision 冲突保护与跨页面同步；旧值由 ponytail-settings 的 migrateLegacyConfig 一次性导入。
    disabledSkills: Schema.array(Schema.string()).volatile(),
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
        return fileURLToPath(new URL('../skills', import.meta.url));
    }
    catch {
        return resolve('skills');
    }
}
/**
 * 读一个可能不存在、且未在 inject 里声明的服务。
 *
 * 为什么不能用属性读：cordis 的 ctx 是 Proxy，读未 inject 的属性会抛
 * cannot get property settings without inject（cordis/lib/index.js:676），而不是返回 undefined。
 * 所以服务在不在只能靠 try/catch 判断——这也正是无 profileContext 的组合
 * （headless / CLI，dsh-base 的 settings 行被 disabled 表达式关掉）需要文件回退通道的原因。
 *
 * 为什么不用 ctx.inject([settings], …)：inject 让 fiber 等这个服务，
 * 而 headless 组合里它永不出现，插件将永远不挂载（连提示词与技能都没有了）。
 */
function readService(ctx, name) {
    try {
        return ctx[name];
    }
    catch {
        return undefined;
    }
}
/**
 * 建立可持久化配置的读写通道。
 *
 * 有 settings 服务时走官方路径：写入落到 profile 补丁（profiles/<name>/cordis.patch.yml），
 * 由宿主的 configForms 承载表单与 revision 冲突保护。
 * 没有时（headless / CLI —— dsh-base 的 settings 行在无 profileContext 时禁用）
 * 回退 config.json 文件通道，那些组合仍然可以改配置。
 */
function createSinkFor(ctx, profileDir) {
    try {
        return createSettingsSink({ settings: readService(ctx, 'settings') }, 'ponytail', { logger: { warn: (msg) => ctx.logger.warn(msg) } });
    }
    catch {
        return createFileSink(profileDir);
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
        // 两个 volatile 字段原样透传：真实运行时它们是引用，读侧经 readVolatile 取值；
        // 测试与 mock 宿主可能传裸值，readVolatile 两种都认。
        ...(rawConfig['defaultMode'] !== undefined
            ? { defaultMode: rawConfig['defaultMode'] }
            : {}),
        ...(rawConfig['disabledSkills'] !== undefined
            ? { disabledSkills: rawConfig['disabledSkills'] }
            : {}),
    };
    // 配置通道：有 settings 服务走官方路径（写入落 profile 补丁，由官方表单承载）；
    // 无 settings 服务的组合（headless / CLI —— dsh-base 的 settings 行在无 profileContext 时禁用）
    // 静默回退 config.json 文件通道，不能因迁移而让这些组合失去配置能力。
    const settingsService = readService(ctx, 'settings');
    // profile 目录来自宿主的 profileContext 服务（runProfile 在整棵插件树挂载前 provide，
    // 见 dsh/lib/profile-boot 的 hostCtx.provide('profileContext', ...)）。
    // 它把配置与 flag 的作用域收回单个实例：resolveDshHome() 结构上不含 profile 维度，
    // 落在 $DSH_HOME/ponytail 下的文件被所有实例共享，多实例并存时互相覆盖。
    // 读不到时（mock 宿主 / 裁剪宿主）退回全局路径，行为与旧版一致。
    const profileContext = readService(ctx, 'profileContext');
    const profileDir = typeof profileContext?.dir === 'string' ? profileContext.dir : undefined;
    const configSink = createSinkFor(ctx, profileDir);
    // 优先级唯一真源（ADR-0006）：apply 启动判定与 UI 诊断链共用 resolvePriority，
    // env > patch（cordis 显式声明）> full，逐级 normalizeMode 归一。
    // 旧判定把未归一的 patch 值直接 state.set()（大小写/非法值注入垃圾态），此处一并修复。
    const envRaw = process.env['PONYTAIL_DEFAULT_MODE'];
    if (envRaw && !normalizeMode(envRaw)) {
        // ponytail: env 非法值静默回退与上游一致，此处 warn 为 DSH 差分（不改变回退语义），便于定位配置错误
        ctx.logger.warn(`[ponytail] PONYTAIL_DEFAULT_MODE 值无效（回退后续来源）：${envRaw}`);
    }
    // profile 补丁里的 defaultMode 是 volatile 引用：启动时读一次，之后每次求值都重读，
    // 因此官方表单改动后立刻反映到优先级链，无需重启。命令层写入的乐观值暂存 patchOverride，
    // 收到 loader/volatile-update 的 defaultMode 后清掉。
    let patchOverride;
    const readPatchMode = () => {
        const fromConfig = readVolatile(resolved.defaultMode);
        return patchOverride ?? fromConfig;
    };
    const initialMode = resolvePriority({
        envRaw,
        patchMode: readPatchMode(),
    }).effective;
    const skillDir = resolveDefaultSkillDir(resolved.skillDir);
    // 一次性把 config.json 的两个字段导入 profile 补丁，然后改名旧文件使其幂等。
    // 官方做法同款：dsh-settings 导入退役的 settings.yaml 时先改名再逐 section 写入
    // （dsh-settings/lib/index.js:346-363）。导入失败只 warn，不阻断启动。
    if (settingsService !== undefined && settingsService !== null) {
        void migrateLegacyConfig({
            settings: settingsService,
            namespace: 'ponytail',
            readLegacy: () => readFullConfig(profileDir),
            renameLegacy: async () => {
                try {
                    await rename(getSharedConfigPath(), `${getSharedConfigPath()}.imported`);
                }
                catch {
                    // 旧文件不存在或改名失败：数据仍在 profile 侧，下个版本移除兼容读取时无需处理
                }
            },
            logger: {
                info: (msg) => ctx.logger.info(msg),
                warn: (msg) => ctx.logger.warn(msg),
            },
        }).catch((err) => {
            ctx.logger.warn(`[ponytail] 旧配置迁移失败（不影响启动）：${String(err)}`);
        });
    }
    // 等级状态唯一归属：get()/set()/syncFromFile() 三方法，闭包态随 HMR 重建
    const state = createPonytailState({ sink: configSink, storage: createDiskStorage(profileDir) });
    // 会话启动对齐（对齐上游 ponytail-activate.js SessionStart 语义）：
    // 每次会话启动都按 resolvePriority()（env > patch > config 文件 > full）重写 flag，
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
    skills.registerProvider((control) => {
        providerInstance = new PonytailProvider(ctx, control, {
            providerName: resolved.providerName ?? 'ponytail',
            skillDir,
            // 物理隐藏接线（评审 Important #1 修复）：UI 禁用技能 → state 内存集 → provider.list/get
            // 同步过滤。此前从未传入，UI 改开关对模型侧目录无效（静默失效，跨会话仍放行）。
            // 失效闭环：POST 变更点直调 invalidateSkills() → providerInstance.invalidate() → 宿主重扫。
            isSkillEnabled: (name) => state.isSkillEnabled(name),
        });
        return providerInstance;
    });
    // 类型不安全的事件监听通过 any 绕过，运行时由 cordis 校验
    const anyCtx = ctx;
    // ponytail: skills/change 只保留 debug——官方语义是给消费方（host UI/agent-loop）的
    // 通知缝，提供者不应在其内反向调 control.invalidate()（invalidateCache→notifyChange
    // 会再次 emit 同事件，同步广播无防重入守卫，直接栈溢出）。本插件技能目录变更由
    // UI 变更点直调 invalidateSkills() 收敛（C1 修活 providerInstance 后生效）。
    anyCtx.on('skills/change', (..._args) => {
        ctx.logger.debug('[ponytail] 技能目录已变更');
    });
    // 官方 volatile 提交的通知：宿主 loader 把 profile 补丁里的新值就地写进本进程引用后
    // 派发本事件（cordis-plugin-loader/lib/index.js:420，事件只在插件自己的 fiber 上广播）。
    // 两件事必须在这里收敛，否则都是静默失效：
    // - disabledSkills 变了但技能目录不失效 → 模型侧目录仍列着已禁用的技能；
    // - 命令层的乐观默认值不清理 → 面板写的新值被陈旧缓存压住，永远不生效。
    anyCtx.on('loader/volatile-update', (...args) => {
        const [paths] = args;
        if (!Array.isArray(paths))
            return;
        const touched = new Set(paths.map((segment) => String(segment)));
        if (touched.has('disabledSkills')) {
            state.reloadDisabledSkills();
            try {
                providerInstance?.invalidate();
            }
            catch {
                // 失效失败不阻断：宿主会保留旧缓存到下次自然失效，用户看得见 UI 与模型侧不一致
            }
            ctx.logger.debug('[ponytail] 技能启用状态已变更，技能目录已失效');
        }
        if (touched.has('defaultMode')) {
            patchOverride = undefined;
            ctx.logger.debug('[ponytail] 默认档已由 profile 补丁提交，乐观缓存已清除');
        }
    });
    // 只读推导值走官方 Typert 通道（命名空间 ponytail）：优先级诊断链与当前生效等级
    // 不是配置——它们由 env / profile 补丁 / 兜底三层合并得出，写进配置层
    // 会让落盘值永久盖住真值。浏览器侧经 ctx.remote.ponytail.snapshot() 读取。
    // 直接挂载：服务随插件 fiber 失效自动注销，不需要额外 disposer。
    // 守卫与 settings 同款：精简宿主或 mock 上 ctx.plugin 可能不存在，
    // 缺失时快照通道不可用（客户端降级为不显示优先级段），但不得掀翻其余能力。
    if (typeof ctx.plugin === 'function') {
        ctx.plugin(PonytailRemote, {
            snapshot: () => ({
                currentMode: state.get() ?? 'off',
                priority: resolvePriority({
                    envRaw: process.env['PONYTAIL_DEFAULT_MODE'],
                    patchMode: readPatchMode(),
                }),
            }),
        });
    }
    else {
        ctx.logger.debug('[ponytail] 宿主无 ctx.plugin，远程快照通道未挂载（优先级面板将降级）');
    }
    // Always-on 注入：systemPrompt section，order 50 位于 persona(0) 之后
    const systemPrompt = ctx.systemPrompt;
    systemPrompt.section({
        name: 'ponytail',
        order: 50,
        text: () => {
            // 文件优先：每次注入前拉齐 flag 与内存（外部改 flag 在此收敛）
            try {
                state.reloadDisabledSkills();
            }
            catch {
                // ignore
            }
            return renderPromptSection(skillDir, state);
        },
    });
    // 命令调度器深模块：收敛文本提取、指令语法解析、状态机流转与宿主日志
    const dispatcher = createCommandDispatcher({
        state,
        logger: ctx.logger,
        // 默认档唯一真源（ADR-0007 修订 ADR-0006）：命令层的「兜底切默认档」与 apply 启动判定、
        // UI 面板 defaultMode 共用 resolvePriority().effective（env > patch > config > full）。
        // 修复前未注入此闭包 → 落到 ponytail-config.getDefaultMode()（无 patch 层），
        // 当 cordis.patch.yml 显式声明 defaultMode 时，/ponytail foobar 会把等级从 patch 档切到 config 档（静默不一致）。
        // 必须传实时闭包而非快照：/ponytail default <档> 写盘后，下一次命令解析要读到新值。
        getDefaultMode: () => resolvePriority({
            envRaw,
            patchMode: readPatchMode(),
        }).effective,
        // /ponytail default <档> 写盘后更新 patchMode：用户最新意图覆盖宿主声明，
        // UI 快照与命令兜底同刻读新值（修复评审发现的静默 ignore）
        updateDefaultMode: (mode) => {
            patchOverride = mode;
        },
        writeDefaultMode: (mode) => configSink.writeDefaultMode(mode),
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
    // 清理：HMR 卸载时自动通过 ctx 逆序清理所有注册；额外标记
    ctx.effect(() => {
        return () => {
            ctx.logger.info('[ponytail] 已卸载 — provider 与 prompt 段已移除');
        };
    });
}
export default { name, inject, Config, apply };
//# sourceMappingURL=ponytail.js.map