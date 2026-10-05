/**
 * ponytail-remote — 只读推导值的官方跨端通道
 *
 * 迁移到官方配置组合后，可持久化字段（defaultMode、disabledSkills）由 Cordis Config 的
 * volatile 字段承载，官方表单负责读写；但「优先级诊断链」与「当前生效等级」是**运行时推导值**，
 * 不是配置——它们由环境变量、profile 补丁与内置兜底三层按优先级合并得出，
 * 写进配置层等于让缓存永久盖住真值（env 只有进程重启才变，落盘反而会遮蔽新值）。
 *
 * 因此这两个值走 DSH 官方的 Typert 通道下发，而不是自制 HTTP：
 * - 宿主导出 `TypertRemoteService` 子类，命名空间 `ponytail`；
 * - 网关按服务上的 `typertRemote` 绑定自动发现端点（dsh-api-gateway/lib/index.js:706-719），
 *   无需在任何注册表里登记；
 * - 浏览器侧以 `ctx.remote.ponytail.snapshot()` 调用，走已有的 RPC 载体。
 *
 * 本模块同时承载技能元数据读取（SKILL.md frontmatter 为唯一真源），
 * 原先它挂在 HTTP 端点上，删除 HTTP 后由这里继续提供。
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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
// 兜底元数据：仅当 frontmatter 目录不可读时使用（正常路径以 SKILL.md 为唯一真源，
// 见 readSkillMeta）。与客户端构建期快照同源，防目录不可读时面板空白。
const FALLBACK_SKILL_META = [
    { id: 'ponytail', name: 'ponytail', description: '懒人模式本体：3 档强度，梯子七阶注入' },
    { id: 'ponytail-review', name: 'ponytail-review', description: '过度设计评审：只挑能删的代码，一行一条' },
    { id: 'ponytail-audit', name: 'ponytail-audit', description: '全仓过度设计审计：按可删行数降序猎取臃肿' },
    { id: 'ponytail-debt', name: 'ponytail-debt', description: '债务台账收割：收割所有 ponytail: 注释，建立债务台账' },
    { id: 'ponytail-gain', name: 'ponytail-gain', description: '收益看板：展示 benchmark 中位数收益' },
    { id: 'ponytail-help', name: 'ponytail-help', description: '速查卡：模式、技能、命令与配置速查' },
];
function parseSkillFrontmatter(filePath) {
    try {
        const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        if (!raw.startsWith('---\n'))
            return null;
        const end = raw.indexOf('\n---\n');
        if (end < 0)
            return null;
        const fm = parseYaml(raw.slice(4, end));
        if (typeof fm !== 'object' || fm === null || Array.isArray(fm))
            return null;
        const desc = fm['description'];
        return { description: typeof desc === 'string' ? desc : undefined };
    }
    catch {
        return null;
    }
}
/**
 * 从 skills/ 目录读取全部技能元数据（SKILL.md frontmatter 为唯一真源）。
 * 不按禁用状态过滤——面板需要展示全部 6 项（enabled 由 state.isSkillEnabled 标记）。
 * 目录/文件不可读时回退 FALLBACK_SKILL_META（不抛错）。
 */
export function readSkillMeta(skillDirPath) {
    let names = [];
    try {
        names = readdirSync(skillDirPath, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
            .map((d) => d.name)
            .sort();
    }
    catch {
        return FALLBACK_SKILL_META.map((m) => ({ ...m }));
    }
    const metas = [];
    for (const name of names) {
        const fm = parseSkillFrontmatter(join(skillDirPath, name, 'SKILL.md'));
        metas.push({ id: name, name, description: fm?.description ?? name });
    }
    return metas.length > 0 ? metas : FALLBACK_SKILL_META.map((m) => ({ ...m }));
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