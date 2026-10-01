# Changelog

所有重要变更记录于此，格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号与上游 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) 同步。

> **版本策略**：每个版本固定带 `-dsh.N` 后缀（如 `4.10.0-dsh.0`、`4.10.0-dsh.1`），初始即 `-dsh.0`。上游发新版时重置为新上游版本的 `-dsh.0`（如 `4.10.0-dsh.0`），用 `pnpm run bump:dsh -- 4.10.0`。递增：`pnpm run bump:dsh`。遵循 SemVer 预发布语义。

## [4.10.0-dsh.3] - 2026-10-02

### Changed
- **收窄为 DSH 单一宿主运行时**：`src/ponytail-runtime.ts` 删除 Copilot / Codex / Qoder 三路动态平台探针与 `resolveStateDir()` 的外部宿主分支，flag 文件（`.ponytail-active`）固定持久化于 DSH 配置目录（`$XDG_CONFIG_HOME/ponytail` / `%APPDATA%\ponytail` / `~/.config/ponytail`），与 `config.json` 同源；`src/ponytail-state.ts` 移除 Copilot 文件缺失豁免，flag 缺失即关闭；`src/ponytail-config.ts` 删除 `getClaudeDir()`。
- **文档与元数据同步**：新增 `docs/adr/0004-dsh-single-host-runtime.md` 并给 `docs/adr/0001` 追加修订注记；README 移除四路 flag 兼容描述；`skills/ponytail-help/SKILL.md` 删除 Codex / Claude Code / OpenCode 触发形式与 Claude Code 专属更新段落；CONTEXT.md / CLAUDE.md 同步；`package.json` keywords 移除 `claude-code`。

### Fixed
- **config.json 默认档被 Cordis 缺省填充 shadow**：`Config` schema 的 `defaultMode` 移除 `.default('full')`——Cordis 校验会把 schema 缺省 fill 成显式配置，导致 `%APPDATA%\ponytail\config.json`（或 `~/.config/ponytail/config.json`）的 `defaultMode` 档永远不可达，`/ponytail default <mode>` 持久化的默认在下一会话被静默覆盖回 full。移除后缺省走 `getDefaultMode()`（env > config 文件 > full），与上游 `ponytail-config.js` 语义逐行一致。
- **行为测试补充回归 27 → 28 项**：新增「Config schema: defaultMode 无 Schema 默认值（config.json 默认档可达）」断言，锁定缺省为 undefined 且 `providerName` 默认值保留。

## [4.10.0-dsh.2] - 2026-10-02

### Added
- **状态模块对偶落盘抽象**：`src/ponytail-state.ts` 新增 `syncToFile(): void` 显式落盘方法，与 `syncFromFile()` 形成完全对称的对偶接口（Disk ↔ Memory），主入口 `agent/created` 监听器改用显式 `state.syncToFile()` 替代借用 setter 副作用的隐式刷新。
- **命令调度器纯内存沙箱单测**：`scripts/behavior.test.mjs` 补齐针对 `createCommandDispatcher` 处理 `/ponytail default <mode>` 的两项纯内存沙箱测试（合法模式注入写入、非法模式拦截保护），消除单测写穿磁盘副作用，全量行为测试扩充至 26 项全绿。
- **npm 标准测试脚本**：`package.json` 补全缺失的 `"test": "node scripts/behavior.test.mjs"` 标准脚本，并在 `prepublishOnly` 挂载 `npm test` 发布前守卫。
- **CI/CD 双轨自动化流水线**：`.github/workflows/ci.yml` 扩展 `tags: ["v*"]` 触发器，确保代码 push 与 tag 推送均触发全套测试四件套；`.github/workflows/publish.yml` 补齐 `pnpm typecheck` 并对齐门禁步骤，实现 tag 推送时全套测试门禁 100% 先验通过才触发额外发版。
- **高杠杆行为测试套件扩充**：`scripts/behavior.test.mjs` 新增 14 项行为测试（覆盖多 block 文本清洗提取、多 message 展开合并、切档与失活状态突变、裸指令防误切安全守卫、嵌套 block 消息指令识别、示例行中文标点裁剪、无 SKILL.md 失败面收敛等）。

### Changed
- **命令调度深模块化**：在 `src/ponytail-commands.ts` 实现 `createCommandDispatcher`，将消息文本展开提取（`extractTextFromContent` 与 `extractText`）、指令语法解析、状态机流转（`state.set`）、持久化配置写入（`writeDefaultMode`）与宿主日志格式化整体封装为深模块；消除此前 `CommandParseResult` 导出的 6 个松散布尔/可选字段在外部引起的时序耦合，内部锁死 `reportOnly` 优先分支，彻底杜绝裸指令误切。
- **插件入口骨架瘦身**：`src/ponytail.ts` 由 272 行精简至 221 行（净减 51 行脆弱级联胶水），`agent/pre-step` 与 `session/event` 简化为单行委托调用，入口彻底纯化为声明式插件生命周期装配线。
- **状态接口单一关闭契约**：`state.set('off')` 与 `set(null)` 收敛为同一关闭语义（`set` 边界归一 off→null），`agent/created` 的 off→null 镜像删除；消除「无 flag」与「flag 内容 off」两种关闭形态的契约漂移。
- **发布载荷瘦身**：删除与 logo.png MD5 全同的 `assets/logo-dark.png`（676KB×2 → 单源），README dark srcset 收为单一 `<img>`；零引用上游市场物料移出 `package.json` 的 `files` 白名单，发布包体积从约 1.68MB 骤降至约 0.35MB。
- **架构决策自决与驳回**：正式驳回 Candidate 2（合并 state 与 runtime：破坏上游 1:1 逐行移植锚点与产物守卫，净收益为负）与 Candidate 3（合并 skill 存储与 instructions 渲染：同步高频渲染与异步 Cordis 服务范式正交，强行捏合制造上帝类，违背 YAGNI）。

### Fixed
- **配置写入契约闭环**：`src/ponytail-config.ts` 的 `writeDefaultMode` 底层写操作补充顶层 `try/catch` 守卫，遇到磁盘写保护、EACCES 权限受限或 Windows EBUSY 文件锁等底层 I/O 异常时优雅回退 `null`，彻底闭合 `RuntimeMode | null` 类型契约，防止异常击穿上层。
- **静态门禁产物断言补齐**：`scripts/verify.mjs` 产物检查清单补全遗漏的 `lib/ponytail-commands.js` 与 `lib/ponytail-state.js`，实现全量 7 个编译模块 100% 静态断言覆盖。
- **技能解析极端格式容错**：`src/ponytail-skills.ts` 的 Frontmatter 解析状态机补充 UTF-8 BOM（`\uFEFF`）清洗与分隔行 `trimEnd()` 容错，彻底兼容 Windows 编辑器特殊换行与尾部空白。
- **AbortSignal 迅捷响应契约**：`src/ponytail-skills.ts` 的 `list()` 遍历循环首行补位 `options.signal?.throwIfAborted()`，并在 `parseSkillFile` 优先判定 `signal?.aborted`，严格履行 WHATWG / DSH 规范的 `settle promptly` 契约。
- **技能路径安全解析与调试支持**：`src/ponytail.ts` 的 `resolveDefaultSkillDir` 改用标准 ESM 原生 `new URL('../skills', import.meta.url)`；技能扫描放宽 `!entry.isDirectory() && !entry.isSymbolicLink()`，支持软链接技能目录本地调试；`get()` 增强对 `candidate.locator` 的类型保护与 `dirname(targetPath)` 兜底。
- **示例行裁剪契约找回**：`filterSkillBodyForMode` 示例行正则兼容中文引号/冒号（原上游 ASCII 引号形态在中文化正文下永久失配，lite/full/ultra 三档示例区此前完全相同）。
- **list() 失败面收敛**：删除 `stat` 预检，缺失 SKILL.md 与解析失败汇入同一条 warn+跳过路径（`readFile` 本身即可区分）。
- **监听防御对称**：`agent/pre-step` 防御 catch 补 `warn`，与 `session/event` 失败可见性对齐。

### Removed
- **冗余死代码清理**：`src/ponytail-skills.ts` 的 `list()` 解构精简为 `const { data } = parsed`，彻底消除未用变量与 `void body` 压制代码。

## [4.10.0-dsh.1] - 2026-10-01

### Changed
- 架构深化（6 候选核实后自决 4 实施 2 否决）：
  - 等级状态收敛为深模块 `src/ponytail-state.ts`（`createPonytailState`：`get()/set(mode)/syncFromFile()` 三方法，闭包实例随 HMR 重建）；`ponytail.ts` 的 `currentMode` 散落读写（apply 启动、section text 漂移修正、handlePromptText 四处双写、agent/created 镜像）全部收口——`set()` 内存赢原子落盘、`syncFromFile()` 文件赢纠偏（行为与 4.10.0-dsh.0 逐行等价）
  - 指令渲染收敛为深模块 `render(skillDir, mode)`（`src/ponytail-instructions.ts`）：`systemPrompt` section 回调只留 off 短路 + 一次调用，review 短路指针 + 裁剪 + 失败回退收进模块内，对齐上游 `getPonytailInstructions(mode)` 单一出口形态（行为无可观察变更）
  - 抽取 SkillProvider 子系统为 `src/ponytail-skills.ts`（frontmatter 解析 + 目录扫描 + `PonytailProvider.list/get`，DSH 专属层）；`Config` 接口迁 `src/ponytail-config.ts` 为 `PonytailConfig` 共享类型（entry 侧 `export type Config = PonytailConfig` 别名），消除模块循环依赖；不发明工厂——直接导出同名类，注册保持一行 `new PonytailProvider(ctx, control, { providerName, skillDir })`；`src/ponytail.ts` 由 533 行降至 272 行，只留生命周期与监听器（行为无可观察变更）
  - frontmatter 读取瘦身：`stringField/optionalString/optionalMetadata` 折叠为 `readString/readObject/readMetadata`（调用点零改动，净减行数）
  - `apply` 删不可达死代码 `?? null`（分支守卫已排除 undefined）；`?? 'full'` 保留并改为 `DEFAULT_MODE` 常量（DSH 测试路径直接 `apply(ctx)` 真实依赖该兜底）
  - `PONYTAIL_DEFAULT_MODE` env 非法值由静默回退改为 `ctx.logger.warn`（DSH 差分，不改变回退语义，上游仍静默）；config 文件非法值保持静默（与上游一致）
- `scripts/verify.mjs` 静态检查（不注册 tool）由单文件 `src/ponytail.ts` 扩为整个 `src/` 目录扫描（新模块 `ponytail-state.ts` 纳入覆盖）

### Added
- `scripts/behavior.test.mjs` 新增 2 例：`/ponytail default lite` 持久化、`/ponytail default foobar` 非法默认不切换（instruction 解析用例 6 → 8，总数 9 → 11）

### Cleaned
- `src/ponytail.ts` 由 563 行减至 ~533 行；`handlePromptText` 四处 `setMode/clearMode` 成对 try/catch 由 `state.set()` 原子化吸收

## [4.10.0-dsh.0] - 2026-10-01

### Fixed
- `agent/session-start` 死监听迁移为 `agent/created`：`payload.source` 为 `startup`/`resume` 时对齐 flag 文件（`off` 清空、其余 `setMode(currentMode)`），`clear`/`compact` 不动作——DSH 官方事件模型不存在 `session-start`，原监听永不被触发
- 对齐官方 defensive-patterns：`agent/created` 与 `session/event` 监听整体 `try/catch`，坏订阅者不再断链
- `SkillProvider.list()`/`get()` 尊重 `options.signal`：已 abort 时立即抛 `AbortError` 快速 settle（放弃对 fs 调用的 signal 透传）
- `SkillProvider.list()` ENOENT/ENOTDIR 由记 `warn` 返回 `[]` 改为显式 `{ candidates: [], complete: false }`（显式「发现未完成、不可缓存」）与警告并行
- `scripts/verify.mjs` description 长度断言改用 `yaml.parse` 按 YAML 折叠块真实语义计算并输出真实长度；实测六个技能均 ≤500（262/162/165/161/104/165），无需压缩

### Changed
- 版本重置：与上游 v4.10.0 对齐由 `4.9.0-dsh.5` 重置为 `4.10.0-dsh.0`（`pnpm run bump:dsh -- 4.10.0`）
- peer/devDeps 对齐 DSH 0.2.0-rc.2 运行时：`@deepseek-ai/cordis ^4.0.4`、`@deepseek-ai/dsh-skill >=0.1.0-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0`、`@deepseek-ai/schemastery ^3.18.4`
- 指令解析核心由 `handlePromptText` 抽取为纯函数 `parsePonytailCommand`（新增 `src/ponytail-commands.ts`），行为等价，可脱离插件单测；`@`/`$` 前缀与 `/ponytail:ponytail`/`/ponytail:ponytail-review` 前缀形式对齐上游 4.10.0 mode-tracker
- **未知参数语义对齐上游 else 兜底**：`/ponytail <unknown>` 由 `warn` 不切换（4.9.0-dsh.5 引入的 DSH 差分，上游无此分支）改回静默切到默认等级——与上游 mode-tracker 逐分支一致（含默认 `off` 时落入关闭分支）

### Added
- `scripts/behavior.test.mjs` 最小行为测试（node 内置 test runner）：指令解析 6 例 + 技能裁剪 2 例 + abort 立即 settle 1 例，9/9 通过
- `scripts/verify.mjs` 新增六个 SKILL.md `description` ≤500 静态断言（官方 `catalogDescriptionMaxLength` 默认截断线，防回归）

### Cleaned
- 删除无消费方的 `Config.hideStatus`/`Config.quietStartup` 配置项与 `getHideStatus`/`getQuietStartup`/`getPonytailInstructions`/`writeHookOutput`/`getStatePath` 死代码；删除 `normalizePersistedMode` 孤儿导出（README 与 CHANGELOG 无对应表述，无需同步清理）

## [4.9.0-dsh.5] - 2026-08-22

### Fixed
- `isDeactivationCommand` 去除正则重复 `\s`，保持 spec `.!?。！？` + 空白
- `ponytail-runtime` 平台识别由模块级常量改为函数 `isCopilot()/isCodex()/isQoder()`，修复同进程 env 变更后路径漂移
- `/ponytail <unknown>` 未知参数由静默切默认改为 `warn` 不切换
- `extractText` 双路径提取收敛为 `extractTextFromContent` 复用，消除 `agent/pre-step` 与 `session/event` 重复分支
- `scripts/verify.mjs` 不注册 tool 检查由 `|| / &&` 误优先级改为单正则 `\btools\s*\.\s*register\b|\bdefineTool\b`
- `publish.yml` 幂等：`VERSION` 检查提到 `if/else` 前共享，`workflow_dispatch` 计入 `if`，`Create Release` 受 `skipped` 守卫

### Changed
- `CLAUDE.md` Flag 描述由“三分支”更正为“四路”；验证命令 `--filter` 补 `scope`

## [4.9.0-dsh.4] - 2026-08-22

### Changed
- `CLAUDE.md` 改为本地记忆，不再入仓：加入 `.gitignore`，历史提交中移除该文件，本次构建产物与 `CHANGELOG`/`README` 同步到新版本
- README 安装示例移除括号补充说明，保持示例纯净

## [4.9.0-dsh.3] - 2026-08-22

### Fixed
- `Config` 声明顺序修正为 `interface` 在前、`Schema` 在后，符合 `references/config.md` 的 Schemastery 规范写法（此前 `const` 在前会导致类型声明顺序与上游 `dsh-superpower` 不一致）
- `isDeactivationCommand` 补全中文全句匹配 `退出 ponytail` / `正常模式`，并兼容中文标点 `。！？`

## [4.9.0-dsh.2] - 2026-08-22

### Changed
- README 去版本化：徽章与正文不再写死 `4.9.0-dsh.x`，默认装 `latest`；`logo-dark` 同步为新 logo 相对路径

## [4.9.0-dsh.1] - 2026-08-22

### Changed
- 替换 `assets/logo.png` 为用户指定新 Logo（692KB），原文件已移除；README 徽章同步至 `4.9.0-dsh.1`

## [4.9.0-dsh.0] - 2026-08-21

### Added
- 完整移植上游 v4.9.0：6 个 Skill（`ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` / `ponytail-gain` / `ponytail-help`）
- Always-on 梯子注入（`systemPrompt` section, `order: 50`），随 `lite/full/ultra/off/review` 动态裁剪
- 复刻 hooks 行为：`activate` / `mode-tracker` / `subagent` / `config` / `instructions` / `runtime`
- `PONYTAIL_DEFAULT_MODE` env > cordis 配置 > 配置文件 > `full` 三级回退，`review` 不可作默认，BOM 处理、`isShellSafe`、`isDeactivationCommand` 全量对齐
- 中文化：6 个 Skill 的 `description` 与正文、fallback 指令、hook 日志、systemPrompt 注入文本全部中文，触发词兼容中英文
- `CLAUDE.md` 核心记忆库、`LICENSE`（MIT）、`README.md`、`CHANGELOG.md`、`assets/`、`AGENTS.md`

### Changed
- DSH 形态：单一插件包 `@wenaixi/dsh-ponytail`，`dsh.bundle.patch = ./cordis.patch.yml`，包名引用挂载
- 注入文本中文化：`PONYTAIL 已激活 — 等级：…`，`hook` 日志全中文
- 版本统一带 `-dsh.N` 后缀，初始 `4.9.0-dsh.0`

### Fixed
- `initialMode` 优先级修正为 `env > cordis 显式 config > 文件 > full`，与上游语义一致

### Notes
- 不注册 tool（不在 `ctx.tools` 注册任何占位），`scripts/verify.mjs` 校验
- 构建：`pnpm build` (`tsc -p tsconfig.build.json`)，`pnpm typecheck`，`pnpm verify`

[Unreleased]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.2...HEAD
[4.10.0-dsh.2]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.1...v4.10.0-dsh.2
[4.10.0-dsh.1]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.0...v4.10.0-dsh.1
[4.10.0-dsh.0]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.5...v4.10.0-dsh.0
[4.9.0-dsh.5]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.4...v4.9.0-dsh.5
[4.9.0-dsh.4]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.3...v4.9.0-dsh.4
[4.9.0-dsh.3]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.2...v4.9.0-dsh.3
[4.9.0-dsh.2]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.1...v4.9.0-dsh.2
[4.9.0-dsh.1]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.0...v4.9.0-dsh.1
[4.9.0-dsh.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v4.9.0-dsh.0
