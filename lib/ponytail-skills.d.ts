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
 * 与 @deepseek-ai/dsh-skill 的关系：实现其 SkillProvider 接口；
 * 字段以该包 lib/types/index.d.ts 的生成类型为准。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl, SkillProviderObservation } from '@deepseek-ai/dsh-skill';
export declare class PonytailProvider implements SkillProvider {
    readonly name: string;
    private readonly skillDir;
    private readonly ctx;
    constructor(ctx: Context, _control: SkillProviderControl, options: {
        providerName?: string;
        skillDir: string;
    });
    list(options: SkillLookupOptions): Promise<readonly SkillCandidate[] | SkillProviderObservation>;
    get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined>;
}
//# sourceMappingURL=ponytail-skills.d.ts.map