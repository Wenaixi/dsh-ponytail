/**
 * dsh-ponytail — 面向 DSH 的 Ponytail 适配实现（上游参考版本独立记录于 README）
 *
 * 能力全集：
 * - always-on 梯子注入（systemPrompt section，随 mode 动态裁剪）
 * - 6 个 skill：ponytail / ponytail-review / ponytail-audit / ponytail-debt / ponytail-gain / ponytail-help
 * - 对应 DSH 生命周期接线：activate / mode-tracker / subagent / config / instructions / runtime
 * - 不注册任何 tool，全部能力经 Skill 暴露
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type PonytailConfig } from './ponytail-config.js';
export type Config = PonytailConfig;
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    providerName: Schema<string, string, "defined">;
    skillDir: Schema<string, string, "plain">;
    defaultMode: Schema<"full" | "off" | "lite" | "ultra", "full" | "off" | "lite" | "ultra", "volatile">;
    disabledSkills: Schema<NoInfer<string[]>, NoInfer<string[]>, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    providerName: Schema<string, string, "defined">;
    skillDir: Schema<string, string, "plain">;
    defaultMode: Schema<"full" | "off" | "lite" | "ultra", "full" | "off" | "lite" | "ultra", "volatile">;
    disabledSkills: Schema<NoInfer<string[]>, NoInfer<string[]>, "volatile">;
}>>, "plain">;
export declare const name = "ponytail";
export declare const inject: readonly ["skills", "systemPrompt"];
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    inject: readonly ["skills", "systemPrompt"];
    Config: Schema<Schemastery.ObjectS<NoInfer<{
        providerName: Schema<string, string, "defined">;
        skillDir: Schema<string, string, "plain">;
        defaultMode: Schema<"full" | "off" | "lite" | "ultra", "full" | "off" | "lite" | "ultra", "volatile">;
        disabledSkills: Schema<NoInfer<string[]>, NoInfer<string[]>, "volatile">;
    }>>, Schemastery.ObjectT<NoInfer<{
        providerName: Schema<string, string, "defined">;
        skillDir: Schema<string, string, "plain">;
        defaultMode: Schema<"full" | "off" | "lite" | "ultra", "full" | "off" | "lite" | "ultra", "volatile">;
        disabledSkills: Schema<NoInfer<string[]>, NoInfer<string[]>, "volatile">;
    }>>, "plain">;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=ponytail.d.ts.map