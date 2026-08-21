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
export declare const Config: Schema<Schemastery.ObjectS<{
    /** 注册到 ctx.skills 的 provider 名称 */
    providerName: Schema<string, string>;
    /** skill 目录绝对路径，默认取包内 skills/ */
    skillDir: Schema<string, string>;
    /** 默认强度，off 则不自动激活 */
    defaultMode: Schema<"full" | "off" | "lite" | "ultra", "full" | "off" | "lite" | "ultra">;
    /** 是否隐藏状态提示（兼容上游 hideStatus） */
    hideStatus: Schema<boolean, boolean>;
    /** 是否静默启动提示 */
    quietStartup: Schema<boolean, boolean>;
}>, Schemastery.ObjectT<{
    /** 注册到 ctx.skills 的 provider 名称 */
    providerName: Schema<string, string>;
    /** skill 目录绝对路径，默认取包内 skills/ */
    skillDir: Schema<string, string>;
    /** 默认强度，off 则不自动激活 */
    defaultMode: Schema<"full" | "off" | "lite" | "ultra", "full" | "off" | "lite" | "ultra">;
    /** 是否隐藏状态提示（兼容上游 hideStatus） */
    hideStatus: Schema<boolean, boolean>;
    /** 是否静默启动提示 */
    quietStartup: Schema<boolean, boolean>;
}>>;
export interface Config {
    providerName?: string;
    skillDir?: string;
    defaultMode?: 'off' | 'lite' | 'full' | 'ultra';
    hideStatus?: boolean;
    quietStartup?: boolean;
}
export declare const name = "ponytail";
export declare const inject: readonly ["skills", "systemPrompt"];
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    inject: readonly ["skills", "systemPrompt"];
    Config: Schema<Schemastery.ObjectS<{
        /** 注册到 ctx.skills 的 provider 名称 */
        providerName: Schema<string, string>;
        /** skill 目录绝对路径，默认取包内 skills/ */
        skillDir: Schema<string, string>;
        /** 默认强度，off 则不自动激活 */
        defaultMode: Schema<"full" | "off" | "lite" | "ultra", "full" | "off" | "lite" | "ultra">;
        /** 是否隐藏状态提示（兼容上游 hideStatus） */
        hideStatus: Schema<boolean, boolean>;
        /** 是否静默启动提示 */
        quietStartup: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        /** 注册到 ctx.skills 的 provider 名称 */
        providerName: Schema<string, string>;
        /** skill 目录绝对路径，默认取包内 skills/ */
        skillDir: Schema<string, string>;
        /** 默认强度，off 则不自动激活 */
        defaultMode: Schema<"full" | "off" | "lite" | "ultra", "full" | "off" | "lite" | "ultra">;
        /** 是否隐藏状态提示（兼容上游 hideStatus） */
        hideStatus: Schema<boolean, boolean>;
        /** 是否静默启动提示 */
        quietStartup: Schema<boolean, boolean>;
    }>>;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=ponytail.d.ts.map