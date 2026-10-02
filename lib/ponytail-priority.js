/**
 * ponytail-priority — 运行等级的优先级诊断深模块（纯函数，零 I/O）
 *
 * 回答一个用户反复踩的问题：「我在界面上点了等级，为什么没反应？」
 * 根因永远是某一级更高优先级的配置把界面写入的值盖掉了。
 * 本模块把「哪一级在说话」从 apply() 与 HTTP 路由里剥出来，
 * 由宿主一次读齐四个来源的真值后传入，产出可直接渲染的诊断链。
 *
 * 设计约束：纯函数，不读文件、不读环境变量。
 * 所有外部事实由调用方读好后传入，因此单测无需触碰磁盘与环境变量，
 * 诊断链的正确性完全由这里的分支覆盖。
 *
 * 优先级链（高到低）：环境变量 > Profile 补丁 > 用户配置文件 > 内置兜底。
 * 与 apply() 的 initialMode 判定顺序逐行一致，两处不得漂移。
 */
import { normalizeMode, DEFAULT_MODE } from './ponytail-config.js';
const LEVELS = ['env', 'patch', 'config', 'fallback'];
const LABELS = {
    env: { label: '环境变量', location: 'PONYTAIL_DEFAULT_MODE' },
    patch: { label: 'Profile 补丁', location: 'cordis.patch.yml' },
    config: { label: '用户配置文件', location: 'config.json' },
    fallback: { label: '内置兜底', location: '代码常量' },
};
/** 各级的非法值文案：env 与 patch 是人工输入，config 是文件损坏 */
const PROBLEMS = {
    env: '值无效，已忽略',
    patch: '值无效，已忽略',
    config: '文件损坏或字段缺失',
    fallback: '',
};
/**
 * 解析四级优先级链，得出最终生效档与每一级的命中/被覆盖/问题状态。
 *
 * @param input.envRaw - 环境变量 PONYTAIL_DEFAULT_MODE 的原始值；undefined 表示未设置
 * @param input.patchMode - cordis.patch.yml 显式声明的 defaultMode；undefined 表示未声明
 * @param input.configMode - config.json 中的 defaultMode 原始值；undefined 表示缺失或不可读
 * @returns 诊断链（恒 4 项）与最终生效档
 */
export function resolvePriority(input) {
    const raws = [input.envRaw, input.patchMode, input.configMode, DEFAULT_MODE];
    const chain = [];
    let winner = -1;
    for (let i = 0; i < LEVELS.length; i++) {
        const level = LEVELS[i];
        const raw = raws[i];
        const isFallback = level === 'fallback';
        // 兜底级恒有效；其余级别必须能被 normalizeMode 接受才算数
        const valid = isFallback || (typeof raw === 'string' && normalizeMode(raw) !== null);
        // 第一级有效值即命中者，其后所有级别都被压制
        if (winner === -1 && valid)
            winner = i;
        chain.push({
            level,
            label: LABELS[level].label,
            location: LABELS[level].location,
            value: typeof raw === 'string' ? raw : null,
            hit: winner === i,
            shadowed: winner !== -1 && winner < i,
            problem: isFallback || valid || typeof raw !== 'string' ? null : PROBLEMS[level],
        });
    }
    // 兜底级恒有效，winner 不会停留在 -1；此处兜底分支仅防御未来增级
    const effective = normalizeMode(String(chain[winner === -1 ? 3 : winner].value)) ?? DEFAULT_MODE;
    return { chain, effective };
}
//# sourceMappingURL=ponytail-priority.js.map