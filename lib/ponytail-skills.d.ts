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