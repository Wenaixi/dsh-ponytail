# Changelog

所有重要变更记录于此，格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号与上游 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) 同步。

> **版本策略**：每个版本固定带 `-dsh.N` 后缀（如 `4.9.0-dsh.0`、`4.9.0-dsh.1`），初始即 `-dsh.0`。上游发新版时重置为新上游版本的 `-dsh.0`（如 `4.10.0-dsh.0`），用 `pnpm run bump:dsh -- 4.10.0`。递增：`pnpm run bump:dsh`。遵循 SemVer 预发布语义。

## [4.9.0-dsh.5] - 2026-08-22

### Fixed
- `isDeactivationCommand` 去除正则重复 `\s`，保持 spec `.!?。！？` + 空白
- `ponytail-runtime` 平台识别由模块级常量改为函数 `isCopilot()/isCodex()/isQoder()`，修复同进程 env 变更后路径漂移
- `/ponytail <unknown>` 未知参数由静默切默认改为 `warn` 不切换
- `extractText` 双路径提取收敛为 `extractTextFromContent` 复用，消除 `agent/pre-step` 与 `session/event` 重复分支
- `scripts/verify.mjs` 无空 tool 检查由 `|| / &&` 误优先级改为单正则 `\btools\s*\.\s*register\b|\bdefineTool\b`
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
- 无空 tool（不在 `ctx.tools` 注册任何占位），`scripts/verify.mjs` 校验
- 构建：`pnpm build` (`tsc -p tsconfig.build.json`)，`pnpm typecheck`，`pnpm verify`

[4.9.0-dsh.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v4.9.0-dsh.0
