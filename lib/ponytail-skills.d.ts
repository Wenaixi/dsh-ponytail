/**
 * ponytail-skills — SkillProvider 深模块
 *
 * 把 frontmatter 解析（parseFrontmatter/findClosingFrontmatter/parseInvocationPolicy/
 * frontmatterBoolean/readString/readObject/readMetadata/rejectLegacyKey/isSkillName）、
 * 目录扫描（readdir/stat/readFile，全程透传 AbortSignal）与 SkillProvider 的
 * list/get 两个方法整体收拢在模块内部；ponytail.ts 只保留 Cordis 生命周期与
 * 事件监听，注册处一行构造调用。
 *
 * 边界：skillDir 由 entry 解析后传入（config.skillDir 的优先级归 entry 模块）。
 * 描述语言由 getDescriptionLang 闭包现读，来源 skills/descriptions.{lang}.json。
 * 与 @deepseek-ai/dsh-skill 的关系：实现其 SkillProvider 接口；
 * 字段以该包 lib/types/index.d.ts 的生成类型为准。
 */
/** 技能描述的语言。与 Config.skillDescriptionLang 同一取值域。 */
export type SkillLang = 'zh' | 'en';
/** 技能 id 列表与描述的唯一真源：skills/descriptions.{lang}.json */
export declare const SKILL_IDS: readonly ["ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help"];
/**
 * 短描述兜底：描述文件不可读时用（模型目录与面板至少有一行说明，不至于空白）。
 * 完整描述在 skills/descriptions.{lang}.json，不在此重复。
 */
export declare const FALLBACK_DESCRIPTION: Record<SkillLang, Record<string, string>>;
export interface SkillMeta {
    id: string;
    name: string;
    description: string;
}
/** 读 skills/descriptions.<lang>.json；不可读返回 null 由调用方回退。 */
export declare function readSkillDescriptions(lang?: SkillLang): Record<string, string> | null;
/**
 * 从包内描述文件读取技能元数据；文件不可读或缺项时回退短描述。
 *
 * lang 缺省或非法一律按 zh 处理：调用方（面板、Provider）读的是配置值，
 * 而配置可能来自手写的补丁，不保证取值域干净。
 */
export declare function readSkillMeta(lang?: SkillLang): SkillMeta[];
import type { Context } from '@deepseek-ai/cordis';
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl, SkillProviderObservation } from '@deepseek-ai/dsh-skill';
export declare class PonytailProvider implements SkillProvider {
    readonly name: string;
    private readonly skillDir;
    private readonly ctx;
    private readonly control;
    private readonly isSkillEnabled?;
    /** 当前配置要求的描述语言；每次求值现读 volatile 引用，不缓存 */
    private readonly getDescriptionLang?;
    constructor(ctx: Context, control: SkillProviderControl, options: {
        providerName?: string;
        skillDir: string;
        isSkillEnabled?: (name: string) => boolean;
        getDescriptionLang?: () => 'zh' | 'en';
    });
    /**
     * 当前语言的描述表；描述文件不可读时返回 null，调用方回退 frontmatter 里的英文。
     * 每次现读：配置改动经 loader/volatile-update 就地更新引用并触发目录失效，
     * 缓存表会让切换停在旧语言。
     */
    private descriptions;
    invalidate(): void;
    list(options: SkillLookupOptions): Promise<readonly SkillCandidate[] | SkillProviderObservation>;
    get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined>;
}
//# sourceMappingURL=ponytail-skills.d.ts.map