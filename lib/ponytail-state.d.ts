/**
 * ponytail-state — 运行时等级状态的唯一归属模块
 *
 * 收敛原先散落在 apply() 闭包与三处入口的等级状态读写：
 * - 内存态（currentMode）与 flag 文件的同步
 * - 「文件优先」与「内存赢」两种纠偏方向（由调用方选方法表达，不写死一处）
 * - off / review / 非法值的归一
 *
 * 与 config 的关系：flag（.ponytail-active）物理存取内联于此（原 ponytail-runtime.ts 已并入，
 * C6 收敛：46 行薄壳 + 一层间接委托不如直接内联）；也可由 options.storage 注入内存适配器隔离测试。
 * 与 ponytail-config.ts 的关系：默认值解析仍归 config（默认值源 != 运行时状态）。
 *
 * 实例必须是 apply() 内的闭包变量：DSH 常驻进程下 HMR 重载会重建 apply，
 * 模块级单例会让旧状态跨实例存活，与 flag 文件双写竞争。
 */
/**
 * 状态持久化存储适配器契约（两个适配器证明切面价值：生产物理磁盘 + 测试内存隔离）
 */
export interface PonytailStorage {
    read(): string | null;
    write(mode: string): void;
    clear(): void;
}
export interface PonytailStateOptions {
    /** 可选注入的存储适配器；缺省时使用基于 ponytail-runtime 的 DSH 配置目录磁盘实现 */
    storage?: PonytailStorage;
}
export interface PonytailState {
    /** 当前等级的内存视图；不触发任何文件读。null 表示关闭（'off' 由 set 归一为 null） */
    get(): string | null;
    /** 内存赢：写内存并把 flag 落盘（null → 删 flag）。flag 写失败自吞，不阻断会话 */
    set(mode: string | null): void;
    /** 文件优先：读 flag 纠正内存；review 直通、off/非法值→null、flag 缺失→清空 */
    syncFromFile(): void;
    /** 内存优先：将当前内存等级同步落盘至 flag 文件（null 删 flag，有效值写 flag） */
    syncToFile(): void;
    /** 当前禁用的技能名称列表 */
    getDisabledSkills(): string[];
    /** 设置禁用的技能列表（并持久化写盘） */
    setDisabledSkills(skills: string[]): void;
    /** 检查某个技能是否启用（未被禁用） */
    isSkillEnabled(name: string): boolean;
    /** 切换某个技能的状态（启用/禁用），并持久化写盘 */
    toggleSkill(name: string, enabled?: boolean): boolean;
    /** 设置全局默认等级并持久化落盘 */
    setDefaultMode(mode: string): void;
    /** 恢复所有默认配置（等级切回 full，启用所有技能） */
    resetToDefaults(): void;
    /** 文件优先：重读 config.json 的 disabledSkills 重建内存 Set（外部手改文件后的收敛入口） */
    reloadDisabledSkills(): void;
}
export declare function setMode(mode: string): void;
export declare function clearMode(): void;
export declare function readMode(): string | null;
export declare function createPonytailState(options?: PonytailStateOptions): PonytailState;
/**
 * 纯函数守卫：「禁用主技能 ponytail → 关闭运行等级」业务规则的唯一实现。
 * 此前该规则散落在 ponytail-http.ts POST 两分支（disabledSkills 数组与 toggleSkill），
 * 现收敛为单一导出，调用方共享一个守卫（根因修复，防两分支不一致）。
 */
export declare function isMainSkillDisabled(disabled: readonly string[]): boolean;
//# sourceMappingURL=ponytail-state.d.ts.map