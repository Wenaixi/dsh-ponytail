# ADR-0018：统一弹性存储自愈内核与会话提取拓扑解耦

## 状态

已接受（Accepted）

## 上下文

在历经 ADR-0016 与 ADR-0017 的深模块重构后，系统在崩溃安全写盘与破损自愈上取得了显著成效，但全景架构审计（依据 `codebase-design` 与 Fowler 坏味道审查）揭示了两处维护摩擦点：

1. **自愈与存储容错双轨分裂（Duplicated Code / Shotgun Surgery）**：
   - `src/ponytail-settings.ts` 内部针对 `config.json` 实现了两阶自愈引擎（语法修补与正则抢救）及损坏现场留样轮转（最多保留 3 份 `.corrupted.<timestamp>`）；
   - 但在 `src/ponytail-state.ts` 的 `createDiskStorage.readSessions` 中，针对 `session-states.json` 手动复制粘贴了一套结构高度相似的括号计数修补与截断提取正则，且此前缺失现场留样备份功能；
   - 容灾抢救字典使用普通字面量 `{}`，根据 `dsh-plugin-dev` §9.2 规范，存在原型属性假阳性与原型污染风险。

2. **会话目标解构重复与跨模块循环依赖风险**：
   - `src/ponytail-commands.ts` 与 `src/ponytail-instructions.ts` 各自内联了解构 `agent?.session?.id ?? scope?.session?.id ?? session?.id` 的多层可选链探针；
   - `commands` 模块已静态导入 `instructions`（消费 `renderModeUpdate`），若 `instructions` 反向导入 `commands` 的 `resolveSessionId`，将在 ESM 体系下构成循环依赖隐患。

## 决策

1. **提炼统一弹性自愈内核纯函数（Resilience Kernel）**：
   - 在 `src/ponytail-settings.ts` 抽取通用无状态纯函数 `repairJsonSyntax(raw: string): string`，负责清洗悬挂逗号、感知字符串与转义符、自动闭合缺失的未闭合大括号 `{` 与中括号 `[`；
   - 导出损坏现场留样备份器 `backupCorruptedFile(filePath: string, content: string): string | null`，支持按文件名前缀轮转清理，恒定保留最近 3 份案发现场；
   - 在 `salvageConfig` 中将抢救字段暂存字典统一升级为 `Object.create(null)`，对齐 `dsh-plugin-dev` §9.2 原型安全准则。

2. **收敛会话存储自愈接缝（DiskStorage readSessions Deepening）**：
   - `src/ponytail-state.ts` 彻底移除手写的 50+ 行重复括号计数与语法修复样板，直接单向复用 `repairJsonSyntax`、`backupCorruptedFile` 与 `safeAtomicWriteFile`；
   - 严守对齐时序：标准 `JSON.parse(raw)` 只要抛出异常，立即先现场留样备份原始文件，再依次尝试第一阶语法修复与第二阶正则抢救截断，并原地原子重写为合法标准 JSON。

3. **下沉 `resolveSessionId` 建立单向无环依赖拓扑**：
   - 将多通道会话提取纯函数 `resolveSessionId` 下沉至基础无状态配置模块 `src/ponytail-config.ts`；
   - `src/ponytail-instructions.ts` 直接导入并消费 `resolveSessionId`，消除内联脏探针；
   - `src/ponytail-commands.ts` 从 `./ponytail-config.js` 导入并向前兼容重导出，保持公开 API 表面稳定，同时完全消除跨模块循环依赖风险。

## 后果

### 正面收益
- **消减重复样板代码**：消减 ~60 行重复手写的括号计数与语法修复逻辑，实现单一自愈内核；
- **全仓容灾对齐**：会话状态文件 `session-states.json` 与配置文件 `config.json` 共享同等水准的崩溃安全原子替换、语法自愈与留样备份能力；
- **测试表面深化**：新增 C35 行为测试用例覆盖 `resolveSessionId` 4 大通道分支；在 C33/C34 中锁死原型安全（`Object.getPrototypeOf === null`）与留样备份断言，全套行为测试扩充至 113 项，五道门禁全部绿灯。

### 兼容性
- 现有 `ponytail-commands.ts` 对 `resolveSessionId` 的导出保持完全重导出，宿主入口与已有测试无感平滑兼容。
