# ADR-0014: 统一配置通道接缝消灭物理读写击穿 (TurnCoordinator Sink Seam Unification)

- **状态**：已采纳 (Accepted)
- **日期**：2026-10-09
- **相关决策**：[ADR-0006](./0006-priority-config-convergence.md), [ADR-0007](./0007-config-read-convergence-and-default-mode-unification.md), [ADR-0009](./0009-profile-scoped-config-and-flag.md), [ADR-0013](./0013-turn-coordinator-and-storage-adapter-deepening.md)

---

## 背景与问题陈述

在经历 ADR-0013 将轮次生命周期收敛至 `TurnCoordinator` 深模块后，系统整体内聚度大幅提升。然而在全模块架构审查（`improve-codebase-architecture`）中，发现配置读写路径上存在一处严重的**接缝击穿（Leaking Seam）**：

1. **裸文件读写泄漏与接缝绕过**：
   在 `src/ponytail-commands.ts` 中，处理 `/ponytail default <mode>` 指令时，环境参数仅接受了可选的 `writeDefaultMode` 函数，且在缺省时直接回退到 `src/ponytail-config.ts` 的裸文件写盘函数 `writeDefaultMode`。
2. **多环境数据撕裂风险**：
   在配置了官方 settings 服务的生产环境下，配置的真值源位于 Profile 补丁（`profiles/<name>/cordis.patch.yml`）。如果用户在终端发送 `/ponytail default ultra`，命令分发器若未能拿到显式函数绑定，将绕过官方补丁通道悄悄在物理磁盘写入 `config.json`，破坏了 ADR-0007 与 ADR-0009 确立的优先级一致性。
3. **测试表面积污染**：
   缺乏统一的配置通道接缝（Sink Seam），导致命令调度器的单元测试若要测试默认档持久化，往往必须触碰物理磁盘或繁琐地 mock 独立函数指针，违反了“接口就是测试表面”的原则。

---

## 架构决断

### 1. 将 `PonytailConfigSink` 统一接缝注入 `TurnCoordinator`
- 在 `CommandDispatcherEnv` 与 `TurnCoordinatorEnv` 中显式引入 `sink?: PonytailConfigSink`；
- 在 `src/ponytail.ts` 主入口装配处，将现有的 `configSink` 作为 `sink` 一等公民直接注入协调器。

### 2. 确立“读归优先级链，写归统一通道接缝”的分工准则
- **读取准则**：默认档读取优先尊重宿主注入的综合优先级判定源 `env.getDefaultMode`（其内聚了环境变量、Profile 易失引用及优先级仲裁），未提供时再回退至 `env.sink?.readDefaultMode()`；
- **写入准则**：默认档持久化坚决通过 `env.sink.writeDefaultMode` 统一分发。若处于 Settings 服务环境则进入 patch 补丁，若处于 headless 环境则进入 config.json，彻底消除硬编码写盘行为。

### 3. 脱机纯内存测试验证（Seam Verification）
- 在 `scripts/behavior.test.mjs` 中新增测试 `C30 统一配置通道接缝: TurnCoordinator 经由 sink 统一持久化默认档且物理磁盘零触碰`；
- 行为测试套件基线由 107 项提升至 **108 项**。

---

## 后续影响与收益

- **Locality（局部性）**：所有配置持久化逻辑严格收敛在 Sink 适配器内部，消除跨模块的裸 I/O 散落；
- **Leverage（杠杆率）**：命令层调度器完全具备纯内存脱机可测试性，单测无需触碰任何物理文件；
- **契约纯粹性**：彻底防范多会话环境下命令切默认档引发的配置撕裂。
