# dsh-ponytail

<p align="center">
  <img src="assets/logo.png" width="180" alt="Ponytail" />
</p>

<p align="center">
  <strong>懒惰的资深工程师 · 移植到 DeepSeek Harness</strong><br/>
  <em>The best code is the code you never wrote.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT"/></a>
  <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail"><img src="https://img.shields.io/npm/v/@wenaixi/dsh-ponytail?color=111111&style=flat-square" alt="npm"/></a>
  <img src="https://img.shields.io/badge/version-4.9.0-111111?style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/DSH-0.1.1--rc.2-333333?style=flat-square" alt="DSH"/>
  <img src="https://img.shields.io/badge/skills-6-008080?style=flat-square" alt="skills"/>
  <img src="https://img.shields.io/badge/node-%3E%3D18-3C873A?style=flat-square" alt="node"/>
</p>

<p align="center">
  <a href="README.md">中文</a> · <a href="README.en.md">English</a> · <a href="CHANGELOG.md">Changelog</a> · <a href="https://github.com/DietrichGebert/ponytail">上游</a> · <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail">npm</a>
</p>

---

> [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) v4.9.0 的 **DSH 完整移植版**。
> 把「懒惰的资深工程师」带进 DeepSeek Harness：always-on 梯子注入 + 6 个中文 Skill，无空 tool，开箱即用。

## ✨ 特性

- **Always-on 梯子**：7 阶决策（YAGNI → 复用 → 标准库 → 平台原生 → 已有依赖 → 一行 → 最小实现），每轮模型请求前自动注入，`off` 时静默。
- **6 个中文 Skill**：`ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` / `ponytail-gain` / `ponytail-help`，`rank: 550` 可被项目级覆盖。
- **三档强度**：`lite`（点出更懒的替代） / `full`（默认，强制走梯子） / `ultra`（先删后加，挑战需求本身）。
- **上游行为全量复刻**：`PONYTAIL_DEFAULT_MODE` env > cordis 配置 > 配置文件 > `full`；`review` 不可作默认；`stop ponytail` 全句匹配；`ponytail:` 债务台账；`PONYTAIL_SUBAGENT_MATCHER` 过滤。
- **无空 tool**：不在 `ctx.tools` 注册任何占位 tool，全部能力经 `ctx.skills` 暴露。

## 📦 包含能力

| 能力 | 类型 | 说明 |
|---|---|---|
| `ponytail` | skill + always-on | 7 级梯子，lite/full/ultra 三档，触发词兼容中英文 |
| `ponytail-review` | skill | diff 过度设计评审，`delete/stdlib/native/yagni/shrink` |
| `ponytail-audit` | skill | 全仓审计，按可删收益排序 |
| `ponytail-debt` | skill | 收割 `ponytail:` 注释台账 |
| `ponytail-gain` | skill | 收益看板（benchmark 中位数） |
| `ponytail-help` | skill | 速查卡 |
| 模式切换 | hook | `agent/pre-step` + `session/event` 双路径，/ponytail 族指令 |
| 持久化 | 文件 | `~/.config/ponytail/config.json`（Win: `%APPDATA%`），`/ponytail default <mode>` 写入 |

## 🚀 安装

> 默认装到 `web`（你日常的 DSH Web UI，3080 端口）。`demo` 仅为文档示例，可换成任意 `--profile <name>`。

### 方式一：npm（推荐）

```bash
# 作为 DSH 插件安装到 web（自动走 dsh.bundle，下次启动 web 生效，无需手动重启 3080）
dsh plugin --profile web add @wenaixi/dsh-ponytail

# 或作为普通 npm 包
npm i @wenaixi/dsh-ponytail
pnpm add @wenaixi/dsh-ponytail
```

> 版本与上游同步，当前 `4.9.0`，`npm view @wenaixi/dsh-ponytail version` 可查。
> 若看到 `WARN missing peer @deepseek-ai/...` 属正常：peer 由 DSH 运行时提供，不影响安装；看到 `Packages: +2 Done` 即成功。

### 方式二：GitHub 直装（无需构建，lib 已提交）

```bash
dsh plugin --profile web add github:Wenaixi/dsh-ponytail
# 指定 tag / 分支亦可
dsh plugin --profile web add github:Wenaixi/dsh-ponytail#v4.9.0
```

### 方式三：本地联调 / tarball

```bash
pnpm install && pnpm build
dsh plugin --profile web add ./
dsh --profile web --dump-config  # 应能看到 ponytail 行

# 或
pnpm pack && dsh plugin --profile web add ./wenaixi-dsh-ponytail-4.9.0.tgz
```

### 卸载

```bash
dsh plugin --profile web remove @wenaixi/dsh-ponytail
```

### 验证（不重启 3080）

```bash
pnpm build && pnpm typecheck && node scripts/verify.mjs
dsh --profile demo --dump-config | grep -A2 ponytail
# 隔离 profile 验证 GitHub 直装（不影响 web/3080）
dsh plugin --profile ponytail-test add github:Wenaixi/dsh-ponytail
dsh --profile ponytail-test --dump-config | grep -A2 ponytail
# 验证 npm 直装（隔离 profile）
dsh plugin --profile ponytail-npm-test add @wenaixi/dsh-ponytail
dsh --profile ponytail-npm-test --dump-config | grep -A2 ponytail
```

## ⚙️ 配置

在 `cordis.patch.yml` 行内覆盖：

```yaml
- insert:
    - id: ponytail
      name: "@wenaixi/dsh-ponytail"
      config:
        providerName: ponytail
        skillDir: E:/path/to/skills   # 调试用，默认包内 skills/
        defaultMode: full             # off|lite|full|ultra
```

优先级（与上游一致）：

1. `PONYTAIL_DEFAULT_MODE=ultra` 环境变量（最高）
2. `cordis.patch.yml` 中显式的 `defaultMode`
3. `~/.config/ponytail/config.json`（Windows: `%APPDATA%\ponytail\config.json`，`XDG_CONFIG_HOME` 优先）
4. `full`

持久化：`/ponytail default <mode>` 会写入上述配置文件；`review` 不可作默认。

## 🎮 使用

- **自动生效**：任一编码任务都会注入梯子，无需手动触发。
- **显式切换**：`/ponytail`（full）、`/ponytail lite|full|ultra|off`、`/ponytail default <mode>`、`/ponytail-review`
- **一键技能**：`/ponytail-review`、`/ponytail-audit`、`/ponytail-debt`、`/ponytail-gain`、`/ponytail-help`
- **退出**：`stop ponytail` 或 `normal mode`（需整句匹配）或 `/ponytail off`，随时用 `/ponytail` 恢复
- **子智能体**：`PONYTAIL_SUBAGENT_MATCHER` 正则过滤（与上游一致），DSH 侧所有 agent 共享同一 section

## 🛠️ 本地开发

```bash
pnpm typecheck
pnpm build
pnpm verify                         # 6 技能 + 产物 + 无空 tool 校验
dsh --profile web --patch ./cordis.patch.yml --dump-config
pnpm dsh web --patch ./cordis.patch.yml   # 热重载：改 src/ 或 skills/ 即生效
```

- `skills/` 中文化后需重跑 `build` 与 `verify`（已处理 BOM 与 `\r\n`）
- HMR：改 `src/*.ts` 或 `skills/**/SKILL.md` 后旧 provider/section 自动清理
- 发布：`pnpm build && npm publish --access public --provenance`（需 npm Trusted Publisher 或带 2FA 的 granular token）；或走 GitHub Actions `publish.yml`（`v*` tag 自动发布）
- 版本后缀：上游未发新版时用 `pnpm run bump:dsh` 递增为 `4.9.0-dsh.1`，上游发版后回归纯版本（如 `4.10.0`）

## 📂 目录

```
src/ponytail.ts              # 唯一入口，name/inject/Config/apply
src/ponytail-config.ts       # env > 文件 > full（含 BOM、review 限制、shell 白名单）
src/ponytail-instructions.ts # 按 mode 裁剪 SKILL.md + 中文 fallback
src/ponytail-runtime.ts      # flag 文件 + 多平台识别（Claude/Codex/Qoder）
skills/ponytail/*.md         # 6 个中文 Skill
assets/                      # logo / benchmark 图
lib/                         # 构建产物（已提交，支持 GitHub 直装）
cordis.patch.yml             # - insert: { id: ponytail, name: "@wenaixi/dsh-ponytail" }
```

## 🔗 上游

- 原仓：https://github.com/DietrichGebert/ponytail（MIT，v4.9.0）
- 本包：MIT，`skills/` 与 `AGENTS.md` 原样拷贝自上游，仅为 DSH 运行时做适配
- 关联：`ponytail:` 债务台账、`ponytail-gain` 永不输出本仓实时节省数

## 📄 许可

[MIT](LICENSE) © DietrichGebert / Wenaixi