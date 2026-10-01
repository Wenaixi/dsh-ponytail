# CONTEXT.md — dsh-ponytail 领域模型与架构契约

> 本文件是 `@wenaixi/dsh-ponytail` 的领域模型统一语汇库（Ubiquitous Language）与架构设计契约，基于 `codebase-design` 与深模块设计原则编撰。

---

## 1. 统一领域术语 (Ubiquitous Language)

严格遵循领域统一语言规范，收敛核心业务与架构概念，杜绝模糊与混淆概念：

### 1.1 运行与状态 (Operational States)

- **Mode（运行模式）**:
  当前助手激活的行为姿态，控制提示词梯子的注入强度（`off`、`lite`、`full`、`ultra`、`review`）。
  *Avoid (严禁混用)*: Level, Profile, State, Preset

- **Intensity Ladder（强度梯子）**:
  Ponytail 的 7 阶认知决策框架（YAGNI → 代码复用 → 标准库 → 平台原生 → 已有依赖 → 一行实现 → 最小实现），引导工程师用最少的代码解决问题。
  *Avoid (严禁混用)*: Decision Tree, Lazy Rules, Priority List, Steps

- **State Duality（状态对偶性）**:
  内存态（`currentMode`）与物理 flag 文件（DSH 配置目录下 `.ponytail-active`）在常驻进程生命周期内的同步配对机制。通过 `syncFromFile()` 纠偏与 `syncToFile()` 镜像落盘。
  *Avoid (严禁混用)*: State Cache, Dual Storage, File Sync, Shadow State

- **Deactivation Phrase（失活短句）**:
  用于将激活模式重置为 off 的自然语言短语（`stop ponytail`、`normal mode`、`退出 ponytail`、`正常模式`）。要求整句匹配并剥离末尾标点（`[.!?。！？\s]+`）。
  *Avoid (严禁混用)*: Exit Command, Kill Switch, Stop Keyword, Cancel Prompt

- **Review Pointer Phrase（审查指针短语）**:
  在 review 模式下直接返回的静态指令短语，用于直接指引至 `/ponytail-review` 原生技能，跳过磁盘 I/O。
  *Avoid (严禁混用)*: Review Stub, Short Prompt, Review Fallback

### 1.2 安全与容灾 (Security & Resilience)

- **Shell Safe Path（Shell 安全路径）**:
  严格符合安全字符白名单（`^[A-Za-z0-9 _.\-:/\\~]+$`）的文件系统路径，确保免受 Shell 元字符注入风险。
  *Avoid (严禁混用)*: Clean Path, Sanitized Path, Valid Path, Safe String

- **Fallback Instructions（容灾提示词）**:
  当动态读取、解析或裁剪技能提示词发生不可恢复的磁盘 I/O 异常时，输出的高质量内置中文硬编码应急提示词。
  *Avoid (严禁混用)*: Default Prompt, Backup Instructions, Hardcoded Prompt, Error Prompt

### 1.3 架构流转管道 (Architectural Pipelines)

- **Skill Assembly Pipeline（技能组装流水线）**:
  私有内聚纯函数 `assembleSkillBase`，统一校验、提取并构建符合 Frontmatter 契约的标准化技能定义。
  *Avoid (严禁混用)*: Skill Builder, Skill Loader, Skill Factory, Skill Parser

- **Subagent Section Sharing（子代理切片共享）**:
  DSH 会话中所有衍生出来的子代理（teammate/subagent）自动共享宿主 `systemPrompt.section('ponytail')` 提示词切片的设计。
  *Avoid (严禁混用)*: Subagent Injection, Section Forwarding, Context Inheritance, Multi-Agent Sync

- **Waterfall Middleware Boundary（流水线中间件边界）**:
  不可逾越的链式调用契约，要求 Cordis 事件处理函数无论执行成败必须最终调用并返回 `await next()`。
  *Avoid (严禁混用)*: Hook Guard, Event Wrapper, Filter Chain, Pass-through

---

## 2. 系统接缝与模块边界 (Seams & Boundaries)

| 模块文件 | 架构职责 | 接口深度 (Interface Depth) | 信息隐藏 (Information Hiding) |
|---|---|---|---|
| `ponytail-commands.ts` | 指令分发与纯语法解析 | `createCommandDispatcher`, `parsePonytailCommand` | 前缀归一化、全句失活、持久化提取、上下文展开 |
| `ponytail-instructions.ts` | 提示词裁剪与渲染单一出口 | `render` | Markdown 解析、正则裁剪、review 短路、异常容灾 |
| `ponytail-state.ts` | 对偶状态机管理 | `PonytailState` 对偶接口 | 内存状态流转、对偶落盘、文件优先纠偏 |
| `ponytail-skills.ts` | 技能发现与契约提供 | `PonytailProvider` (SkillProvider) | 目录扫描、Frontmatter 解析、assembleSkillBase 流水线 |
| `ponytail-config.ts` | Schemastery 声明与配置 | `Config`, `resolveDefaultMode` | 三级配置优先级、路径字符白名单、写入 config.json |
| `ponytail-runtime.ts` | DSH 配置目录 flag 物理存取 | flag 读写 | 单一宿主（DSH）配置目录内 `.ponytail-active` 读写 |
| `ponytail.ts` | Cordis 插件生命周期编排 | `apply` | Waterfall 中间件流转、agent/created 钩子、section 注入 |

---

## 3. 核心设计不变性 (Invariants)

1. **零 Tool 注册**：纯靠 SystemPrompt 梯子引导与 6 个中文 Skill 运作，严禁在 `ctx.tools` 注册任何 Tool（见 `docs/adr/0002`）；
2. **模型可见可重建**：提示词必须且只能通过 `ctx.systemPrompt.section('ponytail')` 注入；
3. **无状态直读**：系统提示词坚持按需同步读盘（耗时仅 0.22ms），杜绝过早内存缓存导致的热重载失效（见 `docs/adr/0003`）；
4. **DSH 单一宿主运行时**：不识别任何外部宿主（Copilot / Codex / Qoder / Claude Code / Cursor），flag 固定持久化于 DSH 配置目录（见 `docs/adr/0001` 与 `docs/adr/0004`）；
5. **Waterfall 连贯性**：所有 Cordis Waterfall 中间件必须返回 `await next()`，防御性隔离所有异常。
