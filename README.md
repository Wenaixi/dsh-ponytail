# dsh-ponytail

[dietrichgebert/ponytail](https://github.com/DietrichGebert/ponytail) 的 DSH 完整移植版 — 懒惰 senior 模式开箱即用，无空 tool。

## 包含能力

| 能力 | 类型 | 说明 |
|---|---|---|
| `ponytail` | skill + always-on 注入 | 7 级梯子（YAGNI → 复用 → stdlib → 平台原生 → 已有依赖 → 一行 → 最小实现），lite/full/ultra 三档 |
| `ponytail-review` | skill | diff 复杂度审查，`delete/stdlib/native/yagni/shrink` 五标签 |
| `ponytail-audit` | skill | 全仓扫描，同 review 标签，按可删行数排序 |
| `ponytail-debt` | skill | 收割 `ponytail:` 注释台账 |
| `ponytail-gain` | skill | 收益看板（benchmark 中位数，非本仓实时统计） |
| `ponytail-help` | skill | 帮助卡，含配置与开关说明 |
| always-on 梯子注入 | systemPrompt section | `order:50` 常驻段，随 `lite/full/ultra/off/review` 动态裁剪；off 时为空 |
| 模式切换 | 事件监听 | `agent/pre-step` + `session/event` 双路径解析 `/ponytail` 族指令与 `stop ponytail`/`normal mode` |
| 持久化 | 文件 | `PONYTAIL_DEFAULT_MODE` env > `~/.config/ponytail/config.json` > `full`；` /ponytail default <mode>` 写入文件；flag 文件与上游 Claude/Codex/Qoder 共享 |

## 安装

### 方式一：本地联调（推荐）

```bash
pnpm install && pnpm build
dsh plugin --profile demo add ./
dsh --profile demo --dump-config  # 应能看到 ponytail 行
dsh --profile demo                # 启动后 skill 自动可用
```

### 方式二：从 npm / tarball 安装

```bash
dsh plugin --profile demo add dsh-ponytail
# 或 pnpm pack && dsh plugin --profile demo add ./dsh-ponytail-4.9.0.tgz
```

### 卸载

```bash
dsh plugin --profile demo remove dsh-ponytail
```

## 配置

在 `cordis.patch.yml` 行内覆盖：

```yaml
- insert:
    - id: ponytail
      name: dsh-ponytail
      config:
        providerName: ponytail
        skillDir: E:/path/to/skills   # 调试用，默认包内 skills/
        defaultMode: full             # off|lite|full|ultra
```

环境与文件覆盖（与上游一致）：

- `PONYTAIL_DEFAULT_MODE=ultra` 环境变量优先级最高
- `~/.config/ponytail/config.json`（Windows: `%APPDATA%\ponytail\config.json`）中 `{"defaultMode":"lite"}`
- `/ponytail default <mode>` 运行时持久化到上述文件

## 使用

- 任一编码任务自动生效（always-on）。显式触发：`/ponytail`、` /ponytail lite|full|ultra|off`、`/ponytail-review`、`/ponytail-audit`、`/ponytail-debt`、`/ponytail-gain`、`/ponytail-help`
- 失活：`stop ponytail` 或 `normal mode`（需整句匹配）
- 子 agent：受 `PONYTAIL_SUBAGENT_MATCHER` 正则过滤（与上游一致），DSH 侧所有 agent 共享同一 section，仅日志区分

## 不注册空 tool

本包不在 `ctx.tools` 注册任何占位 tool，全部能力经 `ctx.skills` 的 6 个 skill 暴露，符合 hard rule 7。

## 本地开发

```bash
pnpm typecheck
pnpm build
pnpm dsh web --patch ./cordis.patch.yml   # 热重载：改 src/ 或 skills/ 即生效
```

## 上游

- 原仓：https://github.com/DietrichGebert/ponytail (MIT, 4.9.0)
- 本包：MIT，`skills/` 与 `AGENTS.md` 原样拷贝自上游，仅为 DSH 运行时做适配
