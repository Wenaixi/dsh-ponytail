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
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PONYTAIL_RANK = 550;
function isSkillName(v) {
    return SKILL_NAME_RE.test(v);
}
function readString(data, key) {
    const v = data[key];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}
// 读取任意对象字段（metadata）；仅当值为非数组对象时返回原对象，其余返回 undefined
function readObject(data, key) {
    const v = data[key];
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : undefined;
}
function frontmatterBoolean(data, key) {
    if (!Object.hasOwn(data, key))
        return undefined;
    const v = data[key];
    if (typeof v === 'boolean')
        return v;
    if (v === 1 || v === '1')
        return true;
    if (v === 0 || v === '0')
        return false;
    if (typeof v === 'string') {
        switch (v.toLowerCase()) {
            case 'true':
            case 'yes':
            case 'on':
                return true;
            case 'false':
            case 'no':
            case 'off':
                return false;
        }
    }
    throw new TypeError(`frontmatter field "${key}" must be a boolean`);
}
function rejectLegacyKey(data, legacy, canonical) {
    if (Object.hasOwn(data, legacy)) {
        throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`);
    }
}
function parseInvocationPolicy(data) {
    rejectLegacyKey(data, 'disableModelInvocation', 'disable-model-invocation');
    rejectLegacyKey(data, 'modelInvocable', 'disable-model-invocation');
    rejectLegacyKey(data, 'userInvocable', 'user-invocable');
    const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation');
    const userInvocable = frontmatterBoolean(data, 'user-invocable');
    return {
        modelInvocable: disableModelInvocation !== true,
        userInvocable: userInvocable !== false,
    };
}
function readMetadata(data) {
    const v = readObject(data, 'metadata');
    return v ? { metadata: v } : {};
}
function findClosingFrontmatter(raw, start) {
    let lineStart = start;
    while (lineStart <= raw.length) {
        const nl = raw.indexOf('\n', lineStart);
        const lineEnd = nl < 0 ? raw.length : nl;
        if (raw.slice(lineStart, lineEnd).replace(/\r$/, '').trimEnd() === '---') {
            return { start: lineStart, bodyStart: nl < 0 ? raw.length : nl + 1 };
        }
        if (nl < 0)
            return undefined;
        lineStart = nl + 1;
    }
    return undefined;
}
function parseFrontmatter(raw) {
    const clean = raw.replace(/^\uFEFF/, '');
    const firstNl = clean.indexOf('\n');
    if (firstNl < 0)
        return undefined;
    if (clean.slice(0, firstNl).replace(/\r$/, '').trimEnd() !== '---')
        return undefined;
    const start = firstNl + 1;
    const closing = findClosingFrontmatter(clean, start);
    if (!closing)
        return undefined;
    const parsed = parse(clean.slice(start, closing.start));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return undefined;
    return { data: parsed, body: clean.slice(closing.bodyStart) };
}
async function parseSkillFile(path, signal) {
    let raw;
    try {
        raw = await readFile(path, { encoding: 'utf8', signal });
    }
    catch (err) {
        // abort 冒泡（settle promptly），其余读取错误视为不可加载
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError'))
            throw (signal?.reason ?? err);
        return undefined;
    }
    try {
        const parsed = parseFrontmatter(raw);
        if (!parsed)
            return undefined;
        return parsed;
    }
    catch {
        return undefined;
    }
}
/**
 * 私有组装流水线：从 frontmatter 提取并验证公共基础字段。
 * 校验失败或格式非法时抛出 Error，由外层根据上下文决定记录日志或静默处理。
 */
function assembleSkillBase(data, filePath, providerName) {
    const name = readString(data, 'name');
    const description = readString(data, 'description');
    if (!name || !description) {
        throw new Error('frontmatter 必须包含 name 和 description');
    }
    if (!isSkillName(name)) {
        throw new Error(`无效的 skill 名称 "${name}"`);
    }
    const whenToUse = readString(data, 'whenToUse');
    const invocation = parseInvocationPolicy(data);
    const baseDir = dirname(filePath);
    return {
        name,
        description,
        ...(whenToUse ? { whenToUse } : {}),
        invocation,
        source: 'bundled',
        provider: providerName,
        resourceBase: { kind: 'directory', path: baseDir },
        path: filePath,
        ...readMetadata(data),
    };
}
export class PonytailProvider {
    name;
    skillDir;
    ctx;
    control;
    isSkillEnabled;
    constructor(ctx, control, options) {
        this.ctx = ctx;
        this.control = control;
        this.name = options.providerName ?? 'ponytail';
        this.skillDir = options.skillDir;
        this.isSkillEnabled = options.isSkillEnabled;
    }
    invalidate() {
        try {
            this.control.invalidate();
        }
        catch {
            // 容错处理
        }
    }
    async list(options) {
        options.signal?.throwIfAborted();
        const candidates = [];
        let entries;
        // @types/node 22.x 的 readdir 选项类型未含 signal（Node 运行时自 16 起支持），
        // 用带 signal 字段的局部变量透传，signal 本身仍受 AbortSignal 类型检查
        const readdirOpts = {
            withFileTypes: true,
            signal: options.signal,
        };
        try {
            entries = await readdir(this.skillDir, readdirOpts);
        }
        catch (err) {
            const code = err?.code;
            if (code === 'ENOENT' || code === 'ENOTDIR') {
                this.ctx.logger.warn(`[ponytail] 未找到 skill 目录：${this.skillDir}`);
                // 显式 observation：发现未完成，不可缓存（官方 SkillProviderObservation 语义）
                return { candidates: [], complete: false };
            }
            throw err;
        }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            options.signal?.throwIfAborted();
            if (!entry.isDirectory() && !entry.isSymbolicLink())
                continue;
            if (entry.name.startsWith('.'))
                continue;
            const skillPath = join(this.skillDir, entry.name, 'SKILL.md');
            const parsed = await parseSkillFile(skillPath, options.signal);
            if (!parsed) {
                this.ctx.logger.warn(`[ponytail] 跳过 ${entry.name}：缺少或无效的 frontmatter`);
                continue;
            }
            let base;
            try {
                base = assembleSkillBase(parsed.data, skillPath, this.name);
            }
            catch (err) {
                this.ctx.logger.warn(`[ponytail] 跳过 ${skillPath}：${err.message}`);
                continue;
            }
            if (base.name !== entry.name) {
                this.ctx.logger.warn(`[ponytail] skill 名称 "${base.name}" 与目录 "${entry.name}" 不一致（以 frontmatter 为准）`);
            }
            if (this.isSkillEnabled && !this.isSkillEnabled(base.name)) {
                continue;
            }
            candidates.push({
                ...base,
                rank: PONYTAIL_RANK,
                locator: { path: skillPath, directory: dirname(skillPath) },
            });
        }
        return candidates;
    }
    async get(candidate, options) {
        options.signal?.throwIfAborted();
        if (this.isSkillEnabled && !this.isSkillEnabled(candidate.name))
            return undefined;
        const locatorObj = typeof candidate.locator === 'object' && candidate.locator !== null
            ? candidate.locator
            : undefined;
        const targetPath = locatorObj?.path ?? candidate.path;
        if (!targetPath)
            return undefined;
        const parsed = await parseSkillFile(targetPath, options.signal);
        if (!parsed)
            return undefined;
        let base;
        try {
            base = assembleSkillBase(parsed.data, targetPath, this.name);
        }
        catch {
            return undefined;
        }
        if (base.name !== candidate.name)
            return undefined;
        const targetDir = locatorObj?.directory ?? dirname(targetPath);
        return {
            ...base,
            ...(targetDir !== base.resourceBase.path
                ? { resourceBase: { kind: 'directory', path: targetDir } }
                : {}),
            content: parsed.body.trim(),
        };
    }
}
//# sourceMappingURL=ponytail-skills.js.map