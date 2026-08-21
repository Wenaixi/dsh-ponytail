/**
 * ponytail-config — 移植自 hooks/ponytail-config.js
 *
 * 三级默认解析：环境变量 > 配置文件 > full
 * 保留上游全部边界与兼容行为：
 * - review 不可作默认 (#377)
 * - isDeactivationCommand 全句匹配
 * - isShellSafe 仅白名单路径字符
 * - BOM 去除、config 文件容错
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export const DEFAULT_MODE = 'full';
export const VALID_MODES = ['off', 'lite', 'full', 'ultra', 'review'];
export const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'];
export function normalizeMode(mode) {
    if (typeof mode !== 'string')
        return null;
    const n = mode.trim().toLowerCase();
    return RUNTIME_MODES.includes(n) ? n : null;
}
export function normalizeConfigMode(mode) {
    if (typeof mode !== 'string')
        return null;
    const n = mode.trim().toLowerCase();
    return VALID_MODES.includes(n) ? n : null;
}
export function normalizePersistedMode(mode) {
    return normalizeMode(mode) ?? normalizeConfigMode(mode);
}
// 仅当整句为该命令时失活，避免 "add a normal mode toggle" 误触发
export function isDeactivationCommand(text) {
    const t = String(text ?? '').trim().toLowerCase().replace(/[.!?\s]+$/, '');
    return t === 'stop ponytail' || t === 'normal mode';
}
// 仅白名单路径字符，避免注入 shell 元字符
export function isShellSafe(p) {
    return typeof p === 'string' && /^[A-Za-z0-9 _.\-:/\\~]+$/.test(p);
}
export function getConfigDir() {
    if (process.env['XDG_CONFIG_HOME']) {
        return path.join(process.env['XDG_CONFIG_HOME'], 'ponytail');
    }
    if (process.platform === 'win32') {
        return path.join(process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'ponytail');
    }
    return path.join(os.homedir(), '.config', 'ponytail');
}
export function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}
export function getClaudeDir() {
    return process.env['CLAUDE_CONFIG_DIR'] ?? path.join(os.homedir(), '.claude');
}
export function getDefaultMode() {
    const envMode = process.env['PONYTAIL_DEFAULT_MODE'];
    if (envMode && RUNTIME_MODES.includes(envMode.toLowerCase())) {
        return envMode.toLowerCase();
    }
    try {
        const configPath = getConfigPath();
        const raw = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
        const config = JSON.parse(raw);
        const dm = config['defaultMode'];
        if (typeof dm === 'string' && RUNTIME_MODES.includes(dm.toLowerCase())) {
            return dm.toLowerCase();
        }
    }
    catch {
        // 不存在或解析失败则回退
    }
    return DEFAULT_MODE;
}
export function getHideStatus() {
    const env = process.env['PONYTAIL_HIDE_STATUS'];
    if (env !== undefined) {
        const v = env.trim().toLowerCase();
        return v !== '' && v !== '0' && v !== 'false' && v !== 'no';
    }
    try {
        const raw = readFileSync(getConfigPath(), 'utf8').replace(/^\uFEFF/, '');
        const config = JSON.parse(raw);
        return config['hideStatus'] === true;
    }
    catch {
        return false;
    }
}
export function getQuietStartup() {
    const env = process.env['PONYTAIL_QUIET_STARTUP'];
    if (env !== undefined) {
        const v = env.trim().toLowerCase();
        return v !== '' && v !== '0' && v !== 'false' && v !== 'no';
    }
    try {
        const raw = readFileSync(getConfigPath(), 'utf8').replace(/^\uFEFF/, '');
        const config = JSON.parse(raw);
        return config['quietStartup'] === true;
    }
    catch {
        return false;
    }
}
export function writeDefaultMode(mode) {
    const normalized = normalizeMode(mode);
    if (!normalized)
        return null;
    const configPath = getConfigPath();
    mkdirSync(path.dirname(configPath), { recursive: true });
    let config = {};
    try {
        const raw = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            config = parsed;
    }
    catch {
        // 忽略
    }
    config['defaultMode'] = normalized;
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return normalized;
}
//# sourceMappingURL=ponytail-config.js.map