/**
 * ponytail-state — 运行时等级状态的唯一归属模块
 *
 * 收敛原先散落在 apply() 闭包与三处入口的等级状态读写：
 * - 内存态（currentMode）与 flag 文件的同步
 * - 「文件优先」与「内存赢」两种纠偏方向（由调用方选方法表达，不写死一处）
 * - off / review / 非法值的归一
 *
 * 与 ponytail-runtime.ts 的关系：runtime 负责 DSH 配置目录下 flag 的物理存取，
 * 本模块默认委托它作为默认持久化实现，也可由 options.storage 注入内存适配器隔离测试。
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
}
export declare function createPonytailState(options?: PonytailStateOptions): PonytailState;
//# sourceMappingURL=ponytail-state.d.ts.map