/**
 * ponytail-remote — 只读推导值的官方跨端通道
 *
 * 迁移到官方配置组合后，可持久化字段（defaultMode、disabledSkills）由 Cordis Config 的
 * volatile 字段承载，官方表单负责读写；但「优先级诊断链」与「当前生效等级」是**运行时推导值**，
 * 不是配置——它们由环境变量、profile 补丁、config.json 与内置兜底四层按优先级合并得出，
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
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Context } from '@deepseek-ai/cordis';
import type { PriorityReport } from './ponytail-priority.js';
export interface SkillMeta {
    id: string;
    name: string;
    description: string;
}
/**
 * 从 skills/ 目录读取全部技能元数据（SKILL.md frontmatter 为唯一真源）。
 * 不按禁用状态过滤——面板需要展示全部 6 项（enabled 由 state.isSkillEnabled 标记）。
 * 目录/文件不可读时回退 FALLBACK_SKILL_META（不抛错）。
 */
export declare function readSkillMeta(skillDirPath: string): SkillMeta[];
/** 跨端下发的只读快照：形状必须是 lossless JSON（typert-protocol 的 isRemoteJsonValue） */
export interface PonytailRemoteSnapshot {
    /** 当前会话生效的等级（null 表示关闭，序列化为字符串 'off'） */
    currentMode: string;
    /** 四级优先级诊断链 */
    priority: PriorityReport;
}
export interface PonytailRemoteDeps {
    snapshot(): PonytailRemoteSnapshot;
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
export declare class PonytailRemote extends TypertRemoteService {
    private readonly deps;
    constructor(ctx: Context, deps: PonytailRemoteDeps);
    snapshot(): PonytailRemoteSnapshot;
}
//# sourceMappingURL=ponytail-remote.d.ts.map