import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_MODE, normalizeMode } from './ponytail-config.js';
export function filterSkillBodyForMode(body, mode) {
    const effectiveMode = normalizeMode(mode) ?? DEFAULT_MODE;
    const withoutFrontmatter = String(body ?? '').replace(/^---[\s\S]*?---\s*/, '');
    return withoutFrontmatter
        .split(/\r?\n/)
        .filter((line) => {
        const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
        if (tableLabel) {
            const labelMode = normalizeMode(tableLabel[1].trim());
            if (labelMode)
                return labelMode === effectiveMode;
        }
        // 上游正文用 ASCII 引号，本仓历史中文版用「」与中文冒号；两种形态都要能识别
        const exampleLabel = line.match(/^-\s*([^:]+)(?:：|:)\s*["「]/);
        if (exampleLabel) {
            const labelMode = normalizeMode(exampleLabel[1].trim());
            if (labelMode)
                return labelMode === effectiveMode;
        }
        return true;
    })
        .join('\n');
}
export function getFallbackInstructions(mode) {
    const m = mode;
    return ('PONYTAIL active - level: ' +
        m +
        '\n\n' +
        'You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.\n\n' +
        '## Persistence\n\n' +
        'ACTIVE EVERY RESPONSE. Off only: "stop ponytail" / "normal mode".\n\n' +
        'Current level: **' +
        m +
        '**. Switch: `/ponytail lite|full|ultra`.\n\n' +
        '## The ladder\n\n' +
        'Stop at the first rung that holds (understand the problem first, then pick):\n' +
        '1. Does this need to exist at all? (YAGNI)\n' +
        '2. Already in this codebase? Reuse it, do not re-write.\n' +
        '3. Stdlib does it? Use the stdlib.\n' +
        '4. Native platform feature covers it? Use native.\n' +
        '5. Already-installed dependency solves it? Use it.\n' +
        '6. Can it be one line? One line.\n' +
        '7. Only then: the minimum code that works.\n\n' +
        'Bug fix = root cause: grep every caller of the function you are about to change, fix it once in the shared place instead of patching each caller.\n\n' +
        '## Rules\n\n' +
        'No unrequested abstractions, no avoidable dependencies, no boilerplate nobody asked for. Deletion over addition, boring over clever, fewest files possible. ' +
        'Ship the lazy version and question complex requests in the same response. Between two same-size stdlib options, take the one that is correct on edge cases. ' +
        'Mark deliberate simplifications with a known ceiling using a `ponytail:` comment naming the ceiling and upgrade path.\n\n' +
        '## Output\n\n' +
        'Code first, then at most three short lines: what was skipped, when to add it. If the explanation is longer than the code, delete it. Give in full any explanation the user explicitly asked for.\n\n' +
        '## When NOT to be lazy\n\n' +
        'Never simplify away: understanding the problem, input validation at trust boundaries, error handling that prevents data loss, security, accessibility, hardware calibration, anything explicitly requested. ' +
        'Non-trivial logic leaves one runnable check (an assert-based self-check or one small test file); a trivial one-liner needs no test.\n\n' +
        '## Boundaries\n\n' +
        'Ponytail governs what you build, not how you talk. "stop ponytail" / "normal mode" reverts; the level persists until changed or session end.');
}
// 路径解析：给定 skillDir 返回主技能路径
export function getMainSkillPath(skillDir) {
    return join(skillDir, 'ponytail', 'SKILL.md');
}
/** 独立模式：不走主技能正文裁剪，由同名技能定义行为（上游 INDEPENDENT_MODES 同构） */
const INDEPENDENT_MODES = new Set(['review']);
/**
 * 渲染当前等级的 always-on 指令文本（参考上游 getPonytailInstructions 语义）。
 * 深模块：路径解析、review 短路、读盘、按等级裁剪、失败回退全部内聚于此。
 * 无 ctx、无状态、自身绝不抛（读盘失败回退内置文本），满足 systemPrompt section
 * 的同步 text 契约。skillDir 显式传入：上游硬编码包内路径，DSH 允许 config.skillDir 覆盖。
 */
export function render(skillDir, mode) {
    if (INDEPENDENT_MODES.has(mode)) {
        return 'PONYTAIL active - level: ' + mode + '. Behavior is defined by the /ponytail-' + mode + ' skill.';
    }
    try {
        const raw = readFileSync(getMainSkillPath(skillDir), 'utf8');
        return 'PONYTAIL active - level: ' + mode + '\n\n' + filterSkillBodyForMode(raw, mode);
    }
    catch {
        return getFallbackInstructions(mode);
    }
}
/**
 * SystemPrompt section 的唯一高阶深模块出口：
 * 封装从状态外部纠偏（syncFromFile）、激活与关闭态守卫（off/null 返回空串）、
 * 到按需直读模板（ADR-0003）与保底降级渲染的完整链路。
 */
export function renderPromptSection(skillDir, state) {
    state.syncFromFile();
    const mode = state.get();
    if (!mode || mode === 'off')
        return '';
    return render(skillDir, mode);
}
/**
 * 对齐官方 @deepseek-ai/dsh-tool-skill 的 renderCatalogUpdate 范式：
 * 当会话内命令切档或全局配置变更导致旧会话跟随更新时，绝不修改顶层 SystemPrompt 前缀（100% 保护历史缓存），
 * 而是生成带有 <system-reminder> 的增量系统提醒，在当前轮次末尾追加，大模型当轮以最高注意力即时生效。
 */
export function renderModeUpdate(newMode, previousMode = null, skillDir) {
    const prev = previousMode ? ` (superseding previous level: ${previousMode})` : '';
    if (!newMode || newMode === 'off') {
        return [
            '<system-reminder>',
            `Ponytail mode has been switched OFF${prev}.`,
            'Normal development mode applies for this session until explicitly reactivated. Follow standard engineering practices without ponytail ladder constraints.',
            '</system-reminder>',
        ].join('\n');
    }
    const upper = newMode.toUpperCase();
    const body = skillDir ? render(skillDir, newMode) : getFallbackInstructions(newMode);
    return [
        '<system-reminder>',
        `Ponytail mode updated to ${upper}${prev}.`,
        'This complete instruction set applies to all subsequent responses in this session:',
        '',
        body,
        '</system-reminder>',
    ].join('\n');
}
//# sourceMappingURL=ponytail-instructions.js.map