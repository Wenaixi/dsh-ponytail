# dsh-ponytail

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
    <img src="assets/logo.png" width="180" alt="Ponytail" />
  </picture>
</p>

<p align="center">
  <strong>懒惰的资深工程师 · 移植到 DeepSeek Harness</strong><br/>
  <em>The best code is the code you never wrote.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT"/></a>
  <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail"><img src="https://img.shields.io/npm/v/@wenaixi/dsh-ponytail?color=111111&style=flat-square" alt="npm"/></a>
  <img src="https://img.shields.io/badge/DSH-333333?style=flat-square" alt="DSH"/>
  <img src="https://img.shields.io/badge/skills-6-008080?style=flat-square" alt="skills"/>
</p>

<p align="center">
  <a href="CHANGELOG.md">Changelog</a> · <a href="https://github.com/DietrichGebert/ponytail">上游</a> · <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail">npm</a>
</p>

---

> [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) 的 DSH 完整移植版 — always-on 注入 + 6 个中文 Skill，无空 tool。

## 🚀 安装（默认装到 `web`）

> `web` 即日常的 DSH Web UI（3080）。示例中的 `demo` 可换成任意 `--profile <name>`。

```bash
# 方式一：npm
dsh plugin --profile web add @wenaixi/dsh-ponytail

# 方式二：GitHub 直装（lib 已提交，无需构建）
dsh plugin --profile web add github:Wenaixi/dsh-ponytail

# 方式三：本地 / tarball
pnpm install && pnpm build && dsh plugin --profile web add ./
pnpm pack && dsh plugin --profile web add ./wenaixi-dsh-ponytail-*.tgz

# 卸载
dsh plugin --profile web remove @wenaixi/dsh-ponytail

# 验证
dsh --profile web --dump-config | grep -A2 ponytail
```

> `WARN missing peer @deepseek-ai/...` 属正常，peer 由 DSH 运行时提供；`Packages: +2 Done` 即成功。

## ✨ 特性

- **梯子 7 阶**：YAGNI → 复用 → 标准库 → 平台原生 → 已有依赖 → 一行 → 最小实现，`off` 时静默
- **6 个中文 Skill**（`rank: 550`）：`ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` / `ponytail-gain` / `ponytail-help`
- **三档强度**：`lite` / `full`（默认）/ `ultra`
- **无空 tool**：全部能力经 `ctx.skills` 暴露

| 能力 | 说明 |
|---|---|
| `ponytail` | 7 阶梯子，触发词兼容中英文 |
| `ponytail-review` | diff 评审，`delete/stdlib/native/yagni/shrink` |
| `ponytail-audit` | 全仓审计，按可删收益排序 |
| `ponytail-debt` | 收割 `ponytail:` 注释 |
| `ponytail-gain` | 收益看板（benchmark 中位数） |
| `ponytail-help` | 速查卡 |

## 🪝 Hook 注入

> 上游 `hooks/` 的 4 个生命周期 Hook 已合并进单一 DSH 插件，无需宿主配置。

| 上游 | DSH 侧 |
|---|---|
| `ponytail-config.js` | `src/ponytail-config.ts`（`env > 文件 > full`，`review` 不可默认） |
| `ponytail-instructions.js` | `src/ponytail-instructions.ts`（按 `lite/full/ultra` 裁剪 + 中文 fallback） |
| `ponytail-runtime.js` | `src/ponytail-runtime.ts`（`.ponytail-active` + 四路识别） |
| `ponytail-activate.js` + `mode-tracker.js` + `subagent.js` | `src/ponytail.ts` 统一合并 |

```
启动:  env PONYTAIL_DEFAULT_MODE → cordis defaultMode → ~/.config/ponytail/config.json → full
       → setMode(flag 文件)

每轮请求前: agent/pre-step (waterfall, 必须 return next())
            → 解析 /ponytail 族 / stop ponytail → 切 currentMode + 写 flag → next()

注入: systemPrompt:section { name: ponytail, order: 50 }
      order 50 在 persona(0) 之后、工具(100) 之前；同步读 SKILL.md 按 currentMode 裁剪
      off → 空，review → 指向技能，读盘失败 → 中文 fallback，assembly 前以 readMode() 对齐

持久化: /ponytail default <mode> → 写入 config.json
子智能体: PONYTAIL_SUBAGENT_MATCHER 正则（非法 warn 回退），共享同一 section
HMR: 全部走 ctx，热重载逆序自动清理
```

`systemPrompt` 而非 `agent.inject`：落入日志可重建，`order: 50` 优先级高，每次 `assemble` 动态求值，`off` 零成本。Flag 兼容 `COPILOT_PLUGIN_DATA` / `PLUGIN_DATA` / `QODER_SESSION_ID` / `CLAUDE_PLUGIN_ROOT`。`isCopilot()/isCodex()/isQoder()` 每次读 env，常驻进程 env 变更即时生效。

## ⚙️ 配置

```yaml
- insert:
    - id: ponytail
      name: "@wenaixi/dsh-ponytail"
      config:
        providerName: ponytail
        defaultMode: full  # off|lite|full|ultra
```

优先级：`PONYTAIL_DEFAULT_MODE` env > `cordis.defaultMode` > `~/.config/ponytail/config.json` > `full`。持久化：`/ponytail default <mode>` 写入文件，`review` 不可作默认。

## 🎮 使用

- 自动生效，无需手动触发
- `/ponytail [lite|full|ultra|off]` / `/ponytail default <mode>` / `/ponytail-review` / `/ponytail-audit` / `/ponytail-debt` / `/ponytail-gain` / `/ponytail-help`
- 退出：`stop ponytail` / `normal mode`（整句）或 `/ponytail off`

## 🛠️ 开发

```bash
pnpm typecheck && pnpm build && node scripts/verify.mjs
dsh --profile web --patch ./cordis.patch.yml --dump-config
pnpm dsh web --patch ./cordis.patch.yml  # 热重载
# 发版：pnpm run bump:dsh && pnpm build && npm publish --provenance --access public
# 或 push tag v* 触发 GitHub Actions publish.yml
```

- 版本：与上游 SemVer 同步，每个版本固定带 `-dsh.N`（初始 `4.9.0-dsh.0`、对齐上游 v4.10.0 重置 `4.10.0-dsh.0`），`pnpm run bump:dsh` 递增，上游发新版时 `pnpm run bump:dsh -- <版本>` 重置

---

## 🔗 上游

原仓 https://github.com/DietrichGebert/ponytail（MIT）

## 📄 许可

[MIT](LICENSE)
© DietrichGebert / Wenaixi
