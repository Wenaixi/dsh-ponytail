/**
 * dsh-ponytail — DSH 完整移植版 ponytail (dietrichgebert/ponytail 4.9.0)
 *
 * 能力全集：
 * - always-on 梯子注入（systemPrompt section，随 mode 动态裁剪）
 * - 6 个 skill：ponytail / ponytail-review / ponytail-audit / ponytail-debt / ponytail-gain / ponytail-help
 * - 完整复刻 hooks 行为：activate / mode-tracker / subagent / config / instructions / runtime
 * - 不注册空 tool，全部能力经 Skill 暴露
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export interface Config {
    /** 注册到 ctx.skills 的 provider 名称 */
    providerName?: string;
    /** skill 目录绝对路径，默认取包内 skills/ */
    skillDir?: string;
    /** 默认强度，off 则不自动激活 */
    defaultMode?: 'off' | 'lite' | 'full' | 'ultra';
}
export declare const Config: Schema<Config>;
export declare const name = "ponytail";
export declare const inject: readonly ["skills", "systemPrompt"];
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    inject: readonly ["skills", "systemPrompt"];
    Config: Schema<Config>;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=ponytail.d.ts.map