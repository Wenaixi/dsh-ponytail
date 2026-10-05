/**
 * ponytail-priority — 运行等级的优先级诊断深模块（纯函数，零 I/O）
 *
 * 回答一个用户反复踩的问题：「我在界面上点了等级，为什么没反应？」
 * 根因永远是某一级更高优先级的配置把界面写入的值盖掉了。
 * 本模块把「哪一级在说话」从 apply() 与 HTTP 路由里剥出来，
 * 由宿主一次读齐三个来源的真值后传入，产出可直接渲染的诊断链。
 *
 * 设计约束：纯函数，不读文件、不读环境变量。
 * 所有外部事实由调用方读好后传入，因此单测无需触碰磁盘与环境变量，
 * 诊断链的正确性完全由这里的分支覆盖。
 *
 * 优先级链（高到低）：环境变量 > Profile 补丁 > 内置兜底。
 *
 * config.json 层已随 1A 迁移退役：可持久化配置迁入 profile 补丁后，config.json 只在
 * 无 settings 服务的组合里作为回退读写目标，不再参与优先级链——留在链里就是一层永远不生效的
 * 空壳，而「看着能改其实不生效」正是这套面板最初要解决的坑。
 * 与 apply() 的 initialMode 判定顺序逐行一致，两处不得漂移。
 */
import { type RuntimeMode } from './ponytail-config.js';
/** 优先级级别标识，与 UI 渲染的四种状态一一对应 */
export type PriorityLevel = 'env' | 'patch' | 'fallback';
export interface PrioritySource {
    /** 级别标识 */
    level: PriorityLevel;
    /** 中文标签，如「环境变量」 */
    label: string;
    /** 展示位置，如 PONYTAIL_DEFAULT_MODE */
    location: string;
    /** 该级的实际原始值；null 表示未设置 */
    value: string | null;
    /** true 表示这一级最终生效 */
    hit: boolean;
    /** true 表示有更高优先级命中，本级被压制 */
    shadowed: boolean;
    /** 非 null 时为中文问题说明，供 UI 直接展示 */
    problem: string | null;
}
export interface PriorityReport {
    /** 恒为 3 项，按优先级从高到低 */
    chain: PrioritySource[];
    /** 最终生效档 */
    effective: RuntimeMode;
}
/**
 * 解析三级优先级链，得出最终生效档与每一级的命中/被覆盖/问题状态。
 *
 * @param input.envRaw - 环境变量 PONYTAIL_DEFAULT_MODE 的原始值；undefined 表示未设置
 * @param input.patchMode - cordis.patch.yml 显式声明的 defaultMode；undefined 表示未声明
 * @returns 诊断链（恒 3 项）与最终生效档
 */
export declare function resolvePriority(input: {
    envRaw?: string;
    patchMode?: string;
}): PriorityReport;
//# sourceMappingURL=ponytail-priority.d.ts.map