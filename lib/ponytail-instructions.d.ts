export declare function filterSkillBodyForMode(body: string, mode: string): string;
export declare function getFallbackInstructions(mode: string): string;
export declare function getMainSkillPath(skillDir: string): string;
/**
 * 渲染当前等级的 always-on 指令文本（上游 getPonytailInstructions 的 DSH 对应物）。
 * 深模块：路径解析、review 短路、读盘、按等级裁剪、失败回退全部内聚于此。
 * 无 ctx、无状态、自身绝不抛（读盘失败回退内置文本），满足 systemPrompt section
 * 的同步 text 契约。skillDir 显式传入：上游硬编码包内路径，DSH 允许 config.skillDir 覆盖。
 */
export declare function render(skillDir: string, mode: string): string;
//# sourceMappingURL=ponytail-instructions.d.ts.map