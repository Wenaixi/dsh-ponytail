/**
 * ponytail-remote — 只读推导值的官方跨端通道
 *
 * 迁移到官方配置组合后，可持久化字段（defaultMode、disabledSkills、skillDescriptionLang）由
 * Cordis Config 的 volatile 字段承载，官方表单负责读写；但「优先级诊断链」与「当前生效等级」
 * 是**运行时推导值**，不是配置——它们由环境变量、profile 补丁与内置兜底三层按优先级合并得出，
 * 写进配置层等于让缓存永久盖住真值（env 只有进程重启才变，落盘反而会遮蔽新值）。
 *
 * 因此这两个值走 DSH 官方的 Typert 通道下发，而不是自制 HTTP：
 * - 宿主导出 `TypertRemoteService` 子类，命名空间 `ponytail`；
 * - 网关按服务上的 `typertRemote` 绑定自动发现端点（dsh-api-gateway/lib/index.js:706-719），
 *   无需在任何注册表里登记；
 * - 浏览器侧以 `ctx.remote.ponytail.snapshot()` 调用，走已有的 RPC 载体。
 *
 * 技能描述的语言也在这个通道上：模型目录与配置面板消费的是同一个字符串，
 * 由配置决定下哪一套，缓存的构建期常量会让切换停在旧语言。
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { readFileSync } from 'node:fs';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/** 技能 id 列表与描述的唯一真源：skills/descriptions.{lang}.json */
const SKILL_IDS = ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help'];
/**
 * 短描述兜底：描述文件不可读时用（模型目录与面板至少有一行说明，不至于空白）。
 * 完整描述在 skills/descriptions.{lang}.json，不在此重复。
 */
const FALLBACK_DESCRIPTION = {
    zh: {
        'ponytail': '懒人模式本体：7 阶梯子，lite/full/ultra 三档强度',
        'ponytail-review': '过度设计评审：只挑能删的代码，一行一条',
        'ponytail-audit': '全仓过度设计审计：按可删行数降序猎取臃肿',
        'ponytail-debt': '收割 ponytail: 注释列成债务台账',
        'ponytail-gain': '收益看板：benchmark 中位数实测收益',
        'ponytail-help': '速查卡：模式、技能与命令',
    },
    en: {
        'ponytail': 'Lazy senior dev mode: seven-rung ladder, lite/full/ultra',
        'ponytail-review': 'Over-engineering review: only what can be deleted',
        'ponytail-audit': 'Whole-repo audit for over-engineering, ranked by cut size',
        'ponytail-debt': 'Harvest ponytail: shortcut comments into a debt ledger',
        'ponytail-gain': 'Measured-impact scoreboard from benchmark medians',
        'ponytail-help': 'Quick reference: modes, skills, commands',
    },
};
/**
 * 从包内描述文件读取技能元数据；文件不可读或缺项时回退短描述。
 *
 * lang 缺省或非法一律按 zh 处理：调用方（面板、Provider）读的是配置值，
 * 而配置可能来自手写的补丁，不保证取值域干净。
 */
export function readSkillMeta(lang) {
    const safeLang = lang === 'en' ? 'en' : 'zh';
    const text = readSkillDescriptions(safeLang);
    return SKILL_IDS.map((id) => ({
        id,
        name: id,
        description: text?.[id] ?? FALLBACK_DESCRIPTION[safeLang][id] ?? id,
    }));
}
/** 读 skills/descriptions.<lang>.json；不可读返回 null 由调用方回退。 */
export function readSkillDescriptions(lang) {
    try {
        const raw = readFileSync(new URL(`../skills/descriptions.${lang === 'en' ? 'en' : 'zh'}.json`, import.meta.url), 'utf8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(raw);
        const out = {};
        for (const id of SKILL_IDS) {
            const value = parsed[id];
            if (typeof value === 'string' && value.length > 0)
                out[id] = value;
        }
        return Object.keys(out).length === SKILL_IDS.length ? out : null;
    }
    catch {
        return null;
    }
}
/**
 * 远程服务：只暴露 snapshot 一个只读端点。
 *
 * 写操作一律不在这里——它们走 settings（官方配置通道），由宿主负责校验、
 * revision 冲突检测与 loader 的 volatile 热提交。这里多开一个写端点等于绕过那套保护。
 *
 * `@Remote('snapshot')` 用字符串形式：仓库 tsconfig 的 experimentalDecorators 为 false
 * （标准装饰器），零参 `@Remote()` 在该语义下拿不到 class context，TS 会报 TS2554/TS1241。
 */
let PonytailRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _snapshot_decorators;
    return class PonytailRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _snapshot_decorators = [Remote('snapshot')];
            __esDecorate(this, null, _snapshot_decorators, { kind: "method", name: "snapshot", static: false, private: false, access: { has: obj => "snapshot" in obj, get: obj => obj.snapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        deps = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, deps) {
            super(ctx, 'ponytailRemote', { namespace: 'ponytail' });
            this.deps = deps;
        }
        snapshot() {
            return this.deps.snapshot();
        }
    };
})();
export { PonytailRemote };
//# sourceMappingURL=ponytail-remote.js.map