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

- **Dual-Face Plugin（双面插件）**:
  一个包同时提供 Host 半侧（生命周期、事件、服务）与 Browser 半侧（`exports["./client"]` → `lib/client.js` 的 CJS factory），通过 `dsh.client.platform: web` 与 `dsh.client.inject` 声明接入。本包的客户端产物由 `scripts/build-client.mjs` 单点生成，不允许 `tsc` 再编一份同名文件（同名双来源必然漂移）。
  *Avoid (严禁混用)*: Frontend Plugin, UI Package, Browser Side, 前端包

- **Display Metadata Contract（展示元信息契约）**:
  插件在 DSH 卡片中的标题、描述、图标经 `readPluginMeta` 读取，它把 `${specifier}/package.json` 与 `${specifier}/locale/en.json` 交给 Node exports 解析。**只要包声明了 `exports`，就必须同时放行这两个子路径**，否则卡片只剩包名且零报错。图标须为包内相对路径的 svg/png/jpg/webp 且 <= 256 KiB。
  *Avoid (严禁混用)*: Card Meta, 卡片元信息, Manifest Display, Badge Config

- **Skill Meta Single Source（技能元数据单一真源）**:
  技能的名称与描述一律以 `skills/*/SKILL.md` frontmatter 为唯一真源；宿侧 `readSkillMeta` 实时读取（读不到回退 `FALLBACK_SKILL_META`），客户端构建期提取内嵌。任何模块不得再硬编码技能描述（verify 反向断言锁死）。
  *Avoid (严禁混用)*: Skill Catalog, Meta Copy, 技能清单、描述摘要

- **Config Http Endpoint（配置端点深工厂）**:
  `src/ponytail-http.ts` 的 `createConfigHttpEndpoint(deps)`：GET/POST/405、请求体解析、快照组装、
  readSkillMeta 读取全部内聚，依赖全注入、不碰 ctx，可用假 req/res 直接单测。apply() 只保留接线。
  *Avoid (严禁混用)*: Web Route Handler, Config API, 路由回调

- **Client Locale Dict（客户端双语字典）**:
  面板文案经官方 `ctx.locale.register('ponytail', {zh, en})` + `bind` 提供，字典真源在 `locale/*.json`；
  技能说明保持中文不翻译（用户边界）。诊断链 label/problem 在客户端按 level 查字典覆盖。
  *Avoid (严禁混用)*: i18n System, 国际化框架、前端文案表

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
| `ponytail-config.ts` | Schemastery 声明与配置 | `Config`, `getDefaultMode`, `readFullConfig` / `writeFullConfig` / `resetFullConfig` | 四级配置优先级、模式归一、路径字符白名单、DSH 数据根解析、读写 config.json |
| `ponytail-runtime.ts` | DSH 数据根 flag 物理存取 | flag 读写 | 单一宿主（DSH）数据根内 `.ponytail-active` 读写 |
| `ponytail-priority.ts` | 优先级诊断纯函数 | `resolvePriority` | 四级诊断链组装、状态语义（hit/shadowed/problem） |
| `ponytail.ts` | Cordis 插件生命周期编排 | `apply` | Waterfall 中间件流转、agent/created 钩子、section 注入、`/api/plugins/ponytail/config` 路由 |

---

## 3. 核心设计不变性 (Invariants)

1. **零 Tool 注册**：纯靠 SystemPrompt 梯子引导与 6 个中文 Skill 运作，严禁在 `ctx.tools` 注册任何 Tool（见 `docs/adr/0002`）；
2. **模型可见可重建**：提示词必须且只能通过 `ctx.systemPrompt.section('ponytail')` 注入；
3. **无状态直读**：系统提示词坚持按需同步读盘（耗时仅 0.22ms），杜绝过早内存缓存导致的热重载失效（见 `docs/adr/0003`）；
4. **DSH 单一宿主运行时**：不识别任何外部宿主（Copilot / Codex / Qoder / Claude Code / Cursor），配置与 flag 固定持久化于 DSH 用户数据根 `$DSH_HOME/ponytail`（见 `docs/adr/0001`、`0004`、`0005`）；
5. **会话启动对齐**：每次会话启动按默认档（env > patch > 配置文件 > full）重写 flag（对齐上游 `ponytail-activate.js` SessionStart 语义），`/ponytail <档>` 只在本会话生效，跨会话持久化必须用 `/ponytail default <档>`；
6. **Waterfall 连贯性**：所有 Cordis Waterfall 中间件必须返回 `await next()`，防御性隔离所有异常；
7. **Schema 不给默认值**：`Config.defaultMode` 刻意不带 `.default()`，否则 Cordis 校验会把缺省 fill 成显式配置，永久 shadow 掉 `config.json` 里用户设置的档位。

### 3.1 优先级诊断链（Priority Chain）

用户在界面上点了等级却"没反应"，根因永远是某一级更高优先级的配置把界面写入的值盖掉了。`ponytail-priority.ts` 的 `resolvePriority({ envRaw, patchMode, configMode })` 是纯函数、零 I/O，产出**恒 4 项**的诊断链，顺序与 `apply()` 的 initialMode 判定逐行一致：

| 级别 | 来源 | 语义 |
| --- | --- | --- |
| `env` | `PONYTAIL_DEFAULT_MODE` 环境变量 | 最高 |
| `patch` | `cordis.patch.yml` 的 `defaultMode` | 其次 |
| `config` | `$DSH_HOME/ponytail/config.json` | 再次 |
| `fallback` | 内置 `full` | 兜底 |

每一项带 `label` / `location` / `value` / `hit` / `shadowed` / `problem`，UI 渲染为四种状态：生效中（success）、被覆盖（warning）、未设置（quiet）、值非法或文件损坏（danger）。

> **唯一真源（ADR-0006）**：`resolvePriority().effective` 同时是 apply 的 initialMode 与 GET/POST 响应 defaultMode 的取值来源；客户端面板的 label/problem 展示按 level 查双语字典覆盖（宿侧契约零改动）。

*Avoid（严禁混用）*: priority order, precedence list, 优先级数组、权重排序

### 3.2 存储切面与提示词出口（4.10.0-dsh.4 演进）
- **PonytailStorage**：状态机持久化存储契约，定义 `read()`、`write(mode)`、`clear()` 最小正交三方法。生产使用基于 `ponytail-runtime.ts` 的物理磁盘适配器；单元测试使用纯内存存储适配器（双适配器证明 Seam 价值）。
- **renderPromptSection**：系统提示词生成的唯一高阶深出口，内部原子化自闭环状态同步纠偏（`syncFromFile`）、关闭态空串守卫、按需读取 SKILL.md 与多模式规则裁剪，主入口注册收敛为单行。
