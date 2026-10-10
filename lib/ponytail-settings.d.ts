/**
 * ponytail-settings — 可持久化配置的读写通道（方案 B 深模块）
 *
 * 迁移到 DSH 官方插件配置组合后，本插件的可持久化字段（defaultMode、disabledSkills）
 * 声明为 Cordis Config 的 `.volatile()` 字段，由宿主的 settings 服务投影成官方表单，
 * 写入落到 profile 补丁（`profiles/<name>/cordis.patch.yml`）。
 * 通道本身有两个实现：
 *
 * - `createSettingsSink`：官方路径，经 `ctx.settings.mutate(ns, ops, revision)` 写入。
 *   宿主负责 schema 校验、revision 冲突检测与 loader 的 volatile 热提交。
 * - `createFileSink`：回退路径，直读直写 profile 内的 `ponytail/config.json`（无 profileContext 时退回 DSH 数据根）。
 *   存在于无 profileContext 的组合（headless、CLI）——dsh-base 的 settings 行
 *   `disabled: !!js "!ctx.get('profileContext')"`，那些组合装配不上 settings 服务，
 *   此时必须仍能改配置，不能因迁移而静默失效。
 *
 * 优先级链不在本模块：resolvePriority 仍是 env > profile 补丁 > full 的唯一真源。
 */
import { type FullConfigData, type RuntimeMode } from './ponytail-config.js';
/** 写入操作：与官方 settings.mutate 的 ops 形状一致（dsh-api-settings-controller:432）。 */
export interface ConfigWriteOp {
    op: 'set' | 'unset';
    path: string[];
    value?: unknown;
}
/** settings 服务的最小表面；只声明本模块真正用到的三个方法。 */
export interface SettingsLike {
    mutate(ns: string, ops: ConfigWriteOp[], expectedRevision?: number): Promise<unknown>;
    describe(options?: {
        redactSecrets?: boolean;
    }): {
        namespaces?: {
            ns: string;
            value?: unknown;
        }[];
    } | unknown[];
    update?(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>;
}
export interface PonytailConfigSink {
    /** 当前默认档；未配置时回落到内置兜底 */
    readDefaultMode(): RuntimeMode;
    /** 写入默认档；非法档返回 null 且不写入 */
    writeDefaultMode(mode: string): RuntimeMode | null;
    /** 当前禁用的技能名列表 */
    readDisabled(): string[];
    /** 覆盖式写入禁用列表 */
    writeDisabled(skills: string[]): void;
    /** 清空两项配置（unset 而非写默认值，避免在补丁里留下冗余值） */
    reset(): Promise<void> | void;
}
export interface SettingsSinkOptions {
    logger?: {
        warn(msg: string): void;
    };
}
export declare function createSettingsSink(ctx: {
    settings?: SettingsLike | null;
}, namespace?: string, options?: SettingsSinkOptions): PonytailConfigSink;
/**
 * 崩溃安全原子写盘（Crash-Safe Atomic Write）：
 * 先写入同目录下的唯一临时文件，再通过系统级原子重命名替换目标文件，
 * 从物理底层杜绝掉电或中断导致的文件 0 字节与半截断破坏。
 */
export declare function safeAtomicWriteFile(filePath: string, content: string): boolean;
/**
 * 损坏现场留样备份与历史轮转：
 * 将损坏原文备份为 <file>.corrupted.<timestamp>，并仅保留最近 3 份历史留样，避免磁盘无限膨胀。
 */
export declare function backupCorruptedFile(filePath: string, content: string): string | null;
/**
 * 通用 JSON 语法轻度清洗与未闭合括号对齐补全（自愈第一阶纯函数，零 I/O）
 */
export declare function repairJsonSyntax(raw: string): string;
export interface SalvageConfigResult {
    salvaged: boolean;
    data: FullConfigData;
    recoveredFields: Record<string, unknown>;
}
/**
 * 启发式破损配置挽救提取器：
 * 当 config.json 遭遇截断、缺失括号、多余逗号或乱码污染导致标准 JSON.parse 失败时，
 * 通过轻度语法修补与模式正则深度提取，最大化捞回用户原有的 defaultMode、disabledSkills 与扩展键。
 */
export declare function salvageConfig(raw: string): SalvageConfigResult;
/**
 * 供外部或向后兼容接缝调用的内部物理文件读取。
 * 具备自愈防御引擎：若检测到磁盘文件破损，自动启动启发式提取、留样备份损坏现场、
 * 并原地安全原子重写一份合法的干净配置文件，使系统平稳运转且后续直读完全自愈。
 */
export declare function readDiskConfig(profileDir?: string): FullConfigData;
/** 供外部或向后兼容接缝调用的内部物理文件写入（字段级 merge，保留未知键，原子落盘） */
export declare function writeDiskConfig(patch: Partial<FullConfigData>, profileDir?: string): FullConfigData | null;
/** 供外部或向后兼容接缝调用的内部物理文件重置 */
export declare function resetDiskConfig(profileDir?: string): FullConfigData | null;
/**
 * 文件回退通道深模块实现：无 settings 服务的组合（headless / CLI）直接读写 profile 内 config.json。
 * 完整内聚 config.json 读写、字段级 merge 与异常容错，对外提供统一的 PonytailConfigSink 契约。
 */
export declare function createFileSink(profileDir?: string): PonytailConfigSink;
export interface LegacyMigrationDeps {
    /** 官方 settings 服务：用 describe 判断是否已设，用 update 写入 */
    settings: {
        describe(options?: {
            redactSecrets?: boolean;
        }): {
            namespaces?: {
                ns: string;
                value?: unknown;
            }[];
        } | unknown[];
        update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>;
    };
    namespace: string;
    /** 读取旧配置文件内容（由调用方提供，便于测试隔离） */
    readLegacy: () => {
        defaultMode: RuntimeMode;
        disabledSkills: string[];
    };
    /** 把旧配置改名以标记已导入（对齐 dsh-settings 的 settings.yaml.imported 做法） */
    renameLegacy: () => Promise<void>;
    logger: {
        info(msg: string): void;
        warn(msg: string): void;
    };
}
/**
 * 一次性把 config.json 的两个字段导入 profile 补丁，并改名旧文件使其幂等。
 *
 * 判据：旧配置「有内容」且 profile 侧该命名空间「还没设过」。两者同时成立才导入。
 * 导入失败只 warn，不阻断启动——老用户配置丢了可以手动再填，但插件不该起不来。
 */
export declare function migrateLegacyConfig(deps: LegacyMigrationDeps): Promise<boolean>;
//# sourceMappingURL=ponytail-settings.d.ts.map