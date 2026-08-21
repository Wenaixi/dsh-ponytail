# Changelog

所有重要变更记录于此，格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号与上游 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) 同步。

## [4.9.0] - 2026-08-21

### Added
- 完整移植上游 v4.9.0：6 个 Skill（`ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` / `ponytail-gain` / `ponytail-help`）
- Always-on 梯子注入（`systemPrompt` section, `order: 50`），随 `lite/full/ultra/off/review` 动态裁剪
- 复刻 hooks 行为：`activate` / `mode-tracker` / `subagent` / `config` / `instructions` / `runtime`
- `PONYTAIL_DEFAULT_MODE` env > cordis 配置 > 配置文件 > `full` 三级回退，`review` 不可作默认，BOM 处理、`isShellSafe`、`isDeactivationCommand` 全量对齐
- 中文化：6 个 Skill 的 `description` 与正文、fallback 指令、hook 日志、systemPrompt 注入文本全部中文，触发词兼容中英文
- `CLAUDE.md` 核心记忆库、`LICENSE`（MIT）、`README.md`/`README.en.md`、`CHANGELOG.md`、`assets/`、`AGENTS.md`

### Changed
- DSH 形态：单一插件包 `dsh-ponytail`，`dsh.bundle.patch = ./cordis.patch.yml`，包名引用挂载
- 注入文本中文化：`PONYTAIL 已激活 — 等级：…`，`hook` 日志全中文

### Fixed
- `initialMode` 优先级修正为 `env > cordis 显式 config > 文件 > full`，与上游语义一致

### Notes
- 无空 tool（不在 `ctx.tools` 注册任何占位），`scripts/verify.mjs` 校验
- 构建：`pnpm build` (`tsc -p tsconfig.build.json`)，`pnpm typecheck`，`pnpm verify`

[4.9.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v4.9.0
