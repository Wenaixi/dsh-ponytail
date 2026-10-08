# ADR-0013: TurnCoordinator 轮次深模块与存储适配器全虚拟化

- **状态**：已采纳 (Accepted)
- **日期**：2026-10-09
- **相关决策**：[ADR-0003](./0003-stateless-instructions-rendering.md), [ADR-0006](./0006-priority-config-convergence.md), [ADR-0012](./0012-zero-cache-miss-session-baseline-and-turn-override.md)

---

## 背景与问题陈述

在经历 ADR-0012 引入“零缓存破坏会话基线与增量轮次更新”后，系统的推理缓存命中率提升至 100%，但在代码架构层面暴露出三处严重的结构性摩擦（Architectural Friction）：

1. **浅模块与逻辑泄露（Shallow Module in Turn Interception）**：
   `createCommandDispatcher` 原先仅承担了微薄的正则匹配语法解析。然而在模型请求拦截点（`agent/pre-step`）中，消息文本提取、下游 waterfall 穿透、会话变动检测、`renderModeUpdate` 构造、数组索引查找与原地替换，以及发射标记落盘这 7 步复杂生命周期全部泄露在入口 `src/ponytail.ts` 中，长达 90 多行胶水代码，缺乏 **Locality**。
2. **“单出口”承诺破损（Broken Single Entrypoint）**：
   `renderPromptSection` 原被标榜为 SystemPrompt 的唯一生产出口。但为了支持 ADR-0012 的具名会话基线锁定，`ponytail.ts` 事实上跳过了该函数，直接调用了底层的 `render(skillDir, baseMode)`。导致出口名存实亡，形成分裂。
3. **隐藏的磁盘硬编码（Hidden Disk I/O Coupling）**：
   `src/ponytail-state.ts` 的 `options.storage`（`PonytailStorage`）此前仅代理了 `.ponytail-active` flag 文件的读写，而会话状态备份 `session-states.json` 内部硬编码调用了 `node:fs` 的 `readFileSync/writeFileSync`。导致单元测试无法做到真正的纯内存隔离，存在测试间文件竞争风险。

---

## 架构决断

### 1. 统摄轮次拦截为深模块：`TurnCoordinator`
- 在 `src/ponytail-commands.ts` 中构建并导出 `createTurnCoordinator(env): TurnCoordinator`；
- 对外暴露极窄接口（Narrow Interface）：`handlePreStep(payload, next)` 与 `handleSessionEvent(session, event)`；
- 内部完整捍卫 **6 大不变量**：
  - **不断链不变量**：异常全面防御捕获，非 `enter` 决策纯净原样透传；
  - **KV Cache 保护不变量**：顶层基线不可变，变动仅局限于当前轮次尾部瞬态消息；
  - **单通知幂等不变量**：同轮流水线重试时原地替换，绝不重复 push 膨胀；
  - **发射标记收敛时机不变量**：仅在下游返回 `kind === "enter"` 后标记已发射；
  - **多会话隔离不变量**：基于 `sessionId` 独立闭环；
  - **只读命令安全不变量**：裸 `/ponytail` 零副作用。
- `src/ponytail.ts` 的两个事件回调缩减为两行纯净委托。

### 2. 统一提示词生成高阶出口：`PromptEngine` 收敛
- 扩展 `renderPromptSection(skillDir, state, context?): string`；
- 模块内部统一接管 `resolveSessionId(context)` 判定：具名会话锁定 `baselineMode` 渲染，无会话平滑降级消费全局 `state.get()`；
- **坚决不引入内存模板缓存**：严守 ADR-0003 铁律，维持原生同步直读，保证免重启热改即时生效；
- `systemPrompt.section("ponytail")` 缩减为一行纯净调用。

### 3. 全状态存储抽象：`StateStorageAdapter`
- 扩展 `PonytailStorage` 契约，引入可选的 `readSessions?(): Record<string, SessionModeState>` 与 `writeSessions?(sessions): void`；
- 物理磁盘适配器（`createDiskStorage`）统一代理 `.ponytail-active` 与 `session-states.json` 读写；
- 导出 `createMemoryStorage()` 纯内存适配器：单元测试物理零触碰磁盘，实现彻底的测试内存隔离。

### 4. 优先级链真值源维持独立（否决与状态引擎合并）
- 严守 ADR-0006 与 ADR-0007，确认 `src/ponytail-priority.ts` 作为**零 I/O 纯函数诊断链**的单一真源价值，坚决不将其并入有状态有 I/O 的容器，保留高回报比的独立白盒测试。

---

## 收益与结果

1. **高杠杆与高局部性（Leverage & Locality）**：宿主入口 `src/ponytail.ts` 清理消除 90+ 行底层消息操作，生命周期内聚度达到极致。
2. **接口即测试面（The Interface is the Test Surface）**：新增测试回归锁 C27（轮次拦截出站契约）、C28（会话事件兜底）与 C29（纯内存隔离存储），行为测试基线扩充至 **107 项全绿**。
3. **物理零磁盘污染**：内存适配器接管全量状态测试，彻底杜绝测试脏文件残留。
