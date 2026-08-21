# CLAUDE.md — dsh-ponytail 项目核心记忆库

> 本文件是 dsh-ponytail 的唯一权威记忆库。每次对话开始需先读取本文件，工作结束需自行维护更新：补充关键决策、删除过时内容、保持专业简洁。

## 1. 项目定位

- **名称**：`@wenaixi/dsh-ponytail`（npm scoped），仓库 `Wenaixi/dsh-ponytail`，版本 `4.9.0`，对齐上游 `DietrichGebert/ponytail` v4.9.0（MIT）。
- **一句话**：把「懒惰的资深工程师」完整移植到 DeepSeek Harness（DSH），开箱即用的 always-on 梯子 + 6 个中文 Skill，无空 tool。
- **上游口号**：The best code is the code you never wrote. 梯子 7 阶：YAGNI → 复用 → 标准库 → 平台原生 → 已有依赖 → 一行 → 最小实现。
- **DSH 形态**：单一插件包 `dsh-ponytail`，`dsh.bundle.patch = ./cordis.patch.yml`，以包名引用挂载，不使用绝对路径。

## 2. 技术栈与依赖

- **语言**：TypeScript ES2022，`NodeNext` 模块，`strict`。
- **运行时**：`@deepseek-ai/cordis ^4.0.1`、`@deepseek-ai/dsh-skill ^0.1.1-rc.2`、`@deepseek-ai/schemastery ^3.18.1` 均为 peer；`yaml ^2.4.2` 为 dependencies。
- **构建**：`tsc -p tsconfig.build.json → lib/`，`typecheck: tsc --noEmit`，`verify: node scripts/verify.mjs`。
- **验证命令**：`pnpm build` / `pnpm typecheck` / `pnpm --filter dsh-ponytail verify` / `dsh --profile web --patch ./cordis.patch.yml --dump-config`。

## 3. 目录结构

```
dsh-ponytail/
  src/
    ponytail.ts              # 唯一插件入口，export name/inject/Config/apply
    ponytail-config.ts       # 移植 hooks/ponytail-config.js（env > 文件 > full）
    ponytail-instructions.ts # 移植 hooks/ponytail-instructions.js（按 mode 裁剪 SKILL.md）
    ponytail-runtime.ts      # 移植 hooks/ponytail-runtime.js（flag 文件 + 多平台识别）
  skills/                    # 6 个 Skill，中文版，已与上游 4.9.0 对齐
    ponytail/SKILL.md
    ponytail-review/SKILL.md
    ponytail-audit/SKILL.md
    ponytail-debt/SKILL.md
    ponytail-gain/SKILL.md
    ponytail-help/SKILL.md
  assets/                    # logo、benchmark 图，原样拷贝
  lib/                       # 构建产物，已提交，支持 GitHub 直装无需构建
  cordis.patch.yml           # - insert: { id: ponytail, name: "@wenaixi/dsh-ponytail" }
  package.json / tsconfig.json / tsconfig.build.json
  scripts/verify.mjs         # 6 技能 + 产物 + 无空 tool 校验
  scripts/bump-dsh.mjs       # DSH 独立迭代版本递增（4.9.0 -> 4.9.0-dsh.1）
  .github/workflows/ci.yml      # push 到 main / PR 时跑 typecheck+build+verify
  .github/workflows/publish.yml # 仅 tag 推送 v* 时发布到 npm（需 NPM_TOKEN）
  AGENTS.md                  # 上游梯子原文（英文，供 OpenCode 等读取）
  README.md / README.en.md   # 中文/英文安装与使用说明（含三渠道安装）
  CHANGELOG.md               # 版本策略与变更记录
  CLAUDE.md                  # 本文件
```

## 4. 能力全集（中文 Skill）

| Skill | 触发 | 说明 |
|-------|------|------|
| `ponytail` | `/ponytail [lite|full|ultra]`、`ponytail/偷懒/最简解法/yagni` | 懒人模式本体，3 档强度，always-on 注入 |
| `ponytail-review` | `/ponytail-review` | diff 过度设计评审，`delete/stdlib/native/yagni/shrink`，一行一条 |
| `ponytail-audit` | `/ponytail-audit` | 全仓审计，同 review 标签，按可删收益排序 |
| `ponytail-debt` | `/ponytail-debt` | 收割 `ponytail:` 注释台账 |
| `ponytail-gain` | `/ponytail-gain` | 收益看板（benchmark 中位数，非本仓统计） |
| `ponytail-help` | `/ponytail-help` | 速查卡，含等级/技能/配置/更新 |

- 全部 Skill `source: bundled`，`rank: 550`，`provider: ponytail`，`description` 已中文化，`name` 保持 kebab-case 英文。
- 触发词兼容中英文：`ponytail`、`偷懒`、`懒人模式`、`最简解法`、`yagni`、`少做一点` 等。
- fallback 指令（`getFallbackInstructions`）已中文化，`filterSkillBodyForMode` 按 `lite/full/ultra` 裁剪表格与示例。

## 5. 插件架构

### 5.1 注册与注入
- **SkillProvider**：`PonytailProvider implements SkillProvider`，`list()` 扫描 `skillDir` 下 `SKILL.md`，校验 `name/description`、非法 name、legacy key，`get()` 二次校验名称漂移。`ENOENT/ENOTDIR` 记 `warn` 返回 `[]`。
- **SystemPrompt Section**：`order: 50`（persona 0 之后、工具指引 100 之前），`text: () => string` 同步读取 `skills/ponytail/SKILL.md` 并按 `currentMode` 裁剪；`off` 返回空字符串；`review` 返回指向 skill 的指针；读盘失败回退中文 fallback。
- **Flag 文件**：`.ponytail-active`，路径由 `getClaudeDir()` 决定，兼容 `CLAUDE_PLUGIN_ROOT`/`COPILOT_PLUGIN_DATA`/`PLUGIN_DATA`/`QODER_SESSION_ID` 三分支（沿用上游 `ponytail-runtime.js`），DSH 侧以文件为跨进程真源。

### 5.2 事件与切换
- **`agent/pre-step` waterfall**：解析 `payload.messages` 文本，处理 `/ponytail` 族指令与 `stop ponytail`/`normal mode`，**必须 `return next()`**，否则短路下游。
- **`session/event` 监听**：`user/message` 时同样解析，覆盖 `inject` 等非 pre-step 路径。
- **`agent/session-start`**：对齐 `ponytail-activate.js`，`off` 时 `clearMode()`，否则 `setMode(currentMode)`。
- **`skills/change` / `agent/created`**：前者记 `debug`，后者处理 `PONYTAIL_SUBAGENT_MATCHER` 正则过滤（仅日志，DSH 侧所有 agent 共享同一 section）。

### 5.3 指令解析
- `/ponytail [lite|full|ultra|off]` 切档；`/ponytail` 裸指令为 report-only；`/ponytail default <mode>` 持久化到 `~/.config/ponytail/config.json` 并同步 `currentMode`；`/ponytail-review` 切 `review`。
- `isDeactivationCommand` 全句匹配，`stop ponytail`/`normal mode`/`退出 ponytail`/`正常模式`（后两者由中文 Skill 触发词覆盖，代码侧保持英文全句匹配以兼容上游）。
- `PONYTAIL_SUBAGENT_MATCHER` 非法正则记 `warn` 并回退为不过滤。

## 6. 配置（Schemastery）

```ts
Config {
  providerName?: string = 'ponytail'
  skillDir?: string       // 调试用，默认包内 skills/
  defaultMode?: 'off'|'lite'|'full'|'ultra' = 'full'
  hideStatus?: boolean = false
  quietStartup?: boolean = false
}
```

- 优先级：`PONYTAIL_DEFAULT_MODE` env（仅 `off/lite/full/ultra`）> `cordis.patch.yml` 显式 `defaultMode` > `~/.config/ponytail/config.json` / `%APPDATA%\ponytail\config.json` / `XDG_CONFIG_HOME` > `full`。
- `review` 不可作默认（#377），`writeDefaultMode` 仅接受 runtime modes。
- `isShellSafe` 白名单路径字符，用于 `skillDir` 日志。

## 7. 硬规则遵守

- **接口以生成参考为准**：`ctx.skills`、`ctx.systemPrompt`、`ctx.logger` 以 DSH 生成类型为准，缺失时以 `anyCtx` 绕过编译、运行时由 cordis 校验。
- **所有贡献走 ctx**：`registerProvider`、`section`、`on`、`effect` 均可随 HMR 逆序清理；顺序敏感清理合并至同一 `ctx.effect`。
- **waterfall 必调 next()**：`agent/pre-step` 始终 `return next()`。
- **配置一律 Schemastery**：默认值写 schema，无效配置响亮失败。
- **无空 tool**：不在 `ctx.tools` 注册任何占位 tool，`scripts/verify.mjs` 静态检查 `tools.register`/`defineTool`。
- **可选依赖判空**：`systemPrompt`/`skills` 通过 `ctx as unknown` 访问并在 `inject` 中声明必需。
- **模型可见可重建**：always-on 注入经 `systemPrompt` 落入日志可重建路径。

## 8. 开发与验证

```bash
pnpm install
pnpm build        # tsc -p tsconfig.build.json
pnpm typecheck
node scripts/verify.mjs
dsh --profile web --patch ./cordis.patch.yml --dump-config  # 应含 ponytail 行
pnpm dsh web --patch ./cordis.patch.yml                     # 热重载
```

- `skills/` 中文化后需重跑 `pnpm build` 与 `verify`（verify 已处理 BOM 与 `\r\n`）。
- HMR：改 `src/*.ts` 或 `skills/**/SKILL.md` 后旧 provider/section 自动清理，不残留。

## 9. 关键决策与变更记录

- 2026-08-21：初始移植 `dietrichgebert/ponytail 4.9.0`，6 技能 + 4 hooks 全量复刻，`ponytail-instructions/config/runtime` 逐行对齐上游边界（BOM 去除、`review` 不可默认、全句失活、shell 白名单）。
- 2026-08-21：中文化：6 个 `SKILL.md` 的 `description` 与正文全部中文，触发词兼容中英文，`getFallbackInstructions` 中文化；`CLAUDE.md` 建为核心记忆库。
- 2026-08-21：`initialMode` 优先级修正为 `env > cordis 显式 config > 文件 > full`，与上游 `ponytail-config.js` 三级语义对齐。
- 2026-08-21：包名切换至 `@wenaixi/dsh-ponytail`（原 `dsh-ponytail` 被占用），`cordis.patch.yml` 与 README 三渠道安装同步；`lib` 已提交，GitHub 直装无需构建（移除 `prepare` 钩子避免 pnpm `onlyBuiltDependencies` 拦截）；npm `@wenaixi/dsh-ponytail@4.9.0` 已发布；CI 拆为 `ci.yml`（push 跑 verify）与 `publish.yml`（tag 才发 npm，支持 `NPM_TOKEN`/OIDC）。
- 2026-08-21：版本策略确立：与上游一致为默认，上游未发版时用 `-dsh.N` 后缀（`4.9.0-dsh.1`），脚本 `scripts/bump-dsh.mjs` + `pnpm run bump:dsh` 一键递增。

## 10. 边界与不做之事

- 不注册空 tool，不引入 `exa`/`context7` 运行时依赖。
- 不修改 `assets/` 二进制与 `AGENTS.md` 英文原文（供外部读取）。
- `ponytail-gain` 永不输出本仓实时节省数，仅展示 benchmark 中位数。
- `ponytail-audit/review` 只猎过度设计，不碰正确性/安全/性能。

## 11. 上游对照

- 原仓：https://github.com/DietrichGebert/ponytail
- 本地克隆校验源：`$env:TEMP\ponytail_src`（`package.json` 4.9.0、`AGENTS.md` 32 行、`skills/*` 6 个、`hooks/*` 6 个、`commands/*.toml` 6 个）
- 参考实现：`E:\newCC\aaa-dsh-go\dsh-superpower\src\superpowers.ts`（313 行，rank 550 同款）
