# ADR-0016: 会话状态跃迁原子事务、存储深模块独占与客户端脱机控制器

- **状态**：已采纳 (Accepted)
- **日期**：2026-10-10
- **相关决策**：[ADR-0012](./0012-zero-cache-miss-session-baseline-and-turn-override.md), [ADR-0013](./0013-turn-coordinator-and-storage-adapter-deepening.md), [ADR-0014](./0014-turn-coordinator-sink-seam-unification.md), [ADR-0015](./0015-skill-catalog-decoupling-from-remote-transport.md)

---

## 背景与问题陈述 (Context & Problem)

在经历 ADR-0012 至 ADR-0015 的渐进式重构后，系统在缓存保护、轮次拦截与依赖解耦上取得了显著收益。然而在全模块架构审查（`improve-codebase-architecture` 与 `dsh-plugin-dev` 审查）中，仍发现以下结构性摩擦（Architectural Friction）：

1. **状态机跃迁时序外泄 (Leaking State Machine Timing)**：
   在 `src/ponytail-commands.ts` 的 `TurnCoordinator.handlePreStep` 中，协作者直接读取 `sessionState.effectiveMode` 与 `lastEmittedMode` 进行裸比对，并在构造更新后显式回调 `state.markSessionEmitted()`。变动检测、发射判定与标记回写三步状态机事务被割裂在协调层，存在时序泄漏与并发重试撕裂风险。
2. **配置持久化双轨制与浅适配器 (Shallow FileSink Adapter)**：
   `src/ponytail-config.ts` 身兼类型声明、路径解析与裸磁盘文件读写多职；而 `src/ponytail-settings.ts` 的 `createFileSink` 仅仅是其薄包装。外部调用方易绕过 Sink 接缝直接写盘，破坏 ADR-0014 契约。
3. **依赖拓扑反向门面残留 (Inverted Facade Coupling)**：
   宿主入口 `src/ponytail.ts` 从跨端传输适配器 `src/ponytail-remote.ts` 导入技能元数据读取函数；同时 `resolveSessionId` 在两处模块逐行重复定义。
4. **双面客户端测试表面脆弱 (Fragile Client Test Surface)**：
   浏览器端 React 配置卡片内联了复杂的选项补齐、诊断灯映射与原子 ops 拍平，在 Node 环境下缺乏毫秒级脱机状态机单测。

---

## 架构决断 (Decision)

依据 `codebase-design` 与 `dsh-plugin-dev` 准则，实施以下四项深模块深化重构：

### 1. 状态跃迁原子事务内聚
在 `src/ponytail-state.ts` 中引入原子深接口：
```typescript
export interface SessionTransitionResult {
  changed: boolean
  effectiveMode: string | null
  previousMode: string | null
}
consumeSessionTransition(sessionId?: string): SessionTransitionResult
```
在状态机内部原子完成模式比对与已发射标记回写。`/agent/pre-step` 拦截点收缩为单次深调用，彻底消灭外部状态比对与显式回写两步泄露，确保单通知幂等不变量。

### 2. 磁盘文件 I/O 独占收归 FileSink
将 `config.json` 的物理读取、BOM 清洗、字段级 merge 与写盘保护完全下沉内聚至 `src/ponytail-settings.ts` 的 `createFileSink` 内部；`src/ponytail-config.ts` 纯化为无状态模块并保留向前兼容接缝薄委托，彻底消除双轨直接写盘漏洞。

### 3. 依赖拓扑正向归正与提取器去重
- 宿主入口 `src/ponytail.ts` 直接从单一真源 `src/ponytail-skills.ts` 导入 `readSkillMeta`，`PonytailRemote` 退回纯 RPC 适配器；
- 彻底删除 `src/ponytail.ts` 内部私有的 `resolveSessionId`，统一从 `./ponytail-commands.js` 导入。

### 4. 客户端领域控制器抽取与纯 Node 脱机单测
- 在 `scripts/build-client.mjs` 提取纯 JS 领域控制器 `CardController`，封装选项计算、诊断灯映射与原子 ops 拍平；
- 在 `scripts/behavior.test.mjs` 中通过 `node:vm` 建立纯内存脱机单测（C32），践行 "The interface is the test surface"。

---

## 架构收益 (Consequences)

- **Locality**：状态机跃迁与发射标记回写收敛为单一事务；配置磁盘持久化收敛至 `FileSink`。
- **Leverage**：调用方代码大幅简化，消除跨步调用引发的状态撕裂。
- **Test Surface**：新增测试回归锁 C31（状态跃迁原子事务）与 C32（双面客户端控制器脱机单测），行为测试基线扩充至 **110 项全绿**。
