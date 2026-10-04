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
  <img src="https://img.shields.io/badge/DSH-333333?style=flat-square" alt="DSH"/>
  <img src="https://img.shields.io/badge/skills-6-008080?style=flat-square" alt="skills"/>
</p>

<p align="center">
  <a href="CHANGELOG.md">Changelog</a> · <a href="https://github.com/DietrichGebert/ponytail">上游</a> · <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail">npm</a>
</p>

---

> 这是面向 DeepSeek Harness 的 Ponytail 适配插件：提供常驻懒人 senior 模式、七阶梯子、6 个中文原生技能和零 tool 注册。实现参考 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)，但本地版本、发布节奏和 DSH 兼容边界独立维护。
>
> **版本对照（2026-10-04 核验）**：本地发行版本为 `5.0.0`；上游参考版本为 `4.10.3`。上游参考版本不会自动决定本地版本号。

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

> **首次安装后若插件卡片只有包名、没有标题描述图标**，说明包的 `exports` 没放行 `./package.json` 与 `./locale/*.json`。这是 DSH 读展示元信息时的硬约束，与安装本身无关。

## ✨ 特性

- **梯子 7 阶**：YAGNI → 复用 → 标准库 → 平台原生 → 已有依赖 → 一行 → 最小实现，`off` 时静默
- **6 个中文 Skill**（`rank: 550`）：`ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` / `ponytail-gain` / `ponytail-help`
- **四种运行模式**：`off` / `lite` / `full`（默认）/ `ultra`
- **无 tool 注册**：全部能力经 `ctx.skills` 暴露

| 能力 | 说明 |
|---|---|
| `ponytail` | 7 阶梯子，触发词兼容中英文 |
| `ponytail-review` | diff 评审，`delete/stdlib/native/yagni/shrink` |
| `ponytail-audit` | 全仓审计，按可删收益排序 |
| `ponytail-debt` | 收割 `ponytail:` 注释 |
| `ponytail-gain` | 收益看板（benchmark 中位数） |
| `ponytail-help` | 速查卡 |

## 🪝 Hook 注入

> 上游 `hooks/` 的 6 个 Hook（config / instructions / runtime / activate / mode-tracker / subagent）已合并进单一 DSH 插件（runtime 的 flag 存取并入 state），无需宿主配置。

| 上游 | DSH 侧 |
|---|---|
| `ponytail-config.js` | `src/ponytail-config.ts`（`env > 文件 > full`，`review` 不可默认） |
| `ponytail-instructions.js` | `src/ponytail-instructions.ts`（唯一出口 `renderPromptSection(skillDir, state)`：review 短路 + 按档裁剪 + 中文 fallback 全部内聚） |
| `ponytail-state.js` | `src/ponytail-state.ts`（`.ponytail-active` 物理存取内联于此——上游 runtime 的 flag 存取已并入 state，DSH 单一宿主无外部探针；技能禁用 reload 收敛同在此） |
| `ponytail-activate.js` | `src/ponytail.ts` 的 `agent/created`（startup/resume 对齐 flag） |
| `ponytail-mode-tracker.js` | `src/ponytail-commands.ts` 的 `createCommandDispatcher`（指令解析纯函数 + 状态机副作用） |
| `ponytail-subagent.js` | `src/ponytail.ts` 的 `agent/created`（`PONYTAIL_SUBAGENT_MATCHER`） |

```
启动:  env PONYTAIL_DEFAULT_MODE → cordis defaultMode → $DSH_HOME/ponytail/config.json → full
       → setMode(flag 文件)   // 会话启动对齐语义，见下方说明

每轮请求前: agent/pre-step (waterfall, 必须 return next())
            → 解析 /ponytail 族 / stop ponytail → 切 currentMode + 写 flag → next()

注入: systemPrompt:section { name: ponytail, order: 50 }
      order 50 在 persona(0) 之后、工具(100) 之前；回调收敛为单行 text: () => renderPromptSection(skillDir, state)
      off → 空，review → 指向技能，读盘失败 → 中文 fallback，assembly 前以 readMode() 对齐

持久化: /ponytail default <mode> → 写入 config.json
子智能体: PONYTAIL_SUBAGENT_MATCHER 正则（非法 warn 回退），共享同一 section
HMR: 全部走 ctx，热重载逆序自动清理
```

`systemPrompt` 而非 `agent.inject`：落入日志可重建，`order: 50` 优先级高，每次 `assemble` 动态求值，`off` 零成本。flag（`.ponytail-active`）与配置同源持久化于 DSH 用户数据根目录（`$DSH_HOME/ponytail`，默认 `~/.dsh/ponytail`），`/ponytail` 切换在 DSH 内闭环。

**会话启动对齐**：每次会话启动都会按默认档（env > patch > 配置文件 > full）重写 flag，这是对齐上游 SessionStart 语义。因此 `/ponytail <档>` **只在本会话生效**；要让某个等级跨会话持久化，必须用 `/ponytail default <档>` 写进配置文件。

## ⚙️ 配置

```yaml
- insert:
    - id: ponytail
      name: "@wenaixi/dsh-ponytail"
      config:
        providerName: ponytail
        defaultMode: full  # off|lite|full|ultra
```

优先级（四级，取第一个有效值）：`PONYTAIL_DEFAULT_MODE` env > `cordis.defaultMode` > `$DSH_HOME/ponytail/config.json`（默认 `~/.dsh/ponytail/config.json`） > `full`。持久化：`/ponytail default <mode>` 写入文件，`review` 不可作默认。

**注意**：`Config.defaultMode` 的 Schema 刻意不带默认值。Cordis 校验会把缺省 fill 成显式配置，一旦填上就会永久压过 `config.json` 里用户设置的档位，让 UI 上的改动看起来"不生效"。

### 界面配置

插件在已安装插件卡片详情内嵌配置面板（`plugins.bundle.config` 插槽），支持四档运行等级、6 个技能的独立开关、一键恢复默认，并给出**四级优先级诊断链**——逐行显示环境变量、Profile 补丁、配置文件、内置兜底各自的值与生效状态，被更高优先级压制的那一级会显式标为"被覆盖"，等级选择器同时禁用。面板读写均经 `/api/plugins/ponytail/config`，落盘位置同样是 `$DSH_HOME/ponytail/config.json`。

若从旧位置升级，首次读取会兼容旧配置，但新写入一律落到 DSH 数据根；旧目录不删不改。

## 🎮 使用

- 自动生效，无需手动触发
- `/ponytail [lite|full|ultra|off]` / `/ponytail default <mode>` / `/ponytail-review` / `/ponytail-audit` / `/ponytail-debt` / `/ponytail-gain` / `/ponytail-help`
- 退出：`stop ponytail` / `normal mode`（整句）或 `/ponytail off`
- 命令行调试：`dsh --profile <name> '<任务>'`——不要写 `headless` 字样，否则任务文本会被 CLI 前置成 `headless <任务>`，整句不再匹配 `/ponytail` 指令前缀（切换指令也就不会生效）。

## 🛠️ 开发

```bash
# 四道门禁，改完必须全绿
pnpm typecheck        # tsc --noEmit
pnpm build            # tsc 出 lib/，再由 build-client.mjs 生成 lib/client.js
node scripts/verify.mjs        # 静态门禁：38 条断言（含 client.js Node API 残留反向断言）（产物/技能/零 tool/落点/元数据真源/locale）
node scripts/behavior.test.mjs # 行为单测（64 项）

# 0 侵入联调
dsh --profile web --patch ./cordis.patch.yml --dump-config  # 仅验证补丁解析，不替代真实启动验收
pnpm dsh web --patch ./cordis.patch.yml   # 热重载
```

- **版本策略**：本地发行版本使用独立的标准 SemVer，例如当前 `5.0.0`；使用 `pnpm version:bump` 递增 patch，或 `pnpm version:set -- 5.1.0` 设置明确版本。旧的 `-dsh.N` 仅属于历史版本策略，不再生成。
- **上游参考**：README 记录上游参考版本和核验日期，但上游发布不会自动改变本地版本；是否升级参考实现由本地兼容性评估决定。
- **发布铁律**：严禁本地 `npm publish` 和未经授权的 `git push`。本地完成门禁后，由授权的 CI tag 流程发布 npm 与 GitHub Release。
- **客户端产物单一来源**：`lib/client.js` 只由 `scripts/build-client.mjs` 生成。`tsconfig.build.json` 不得把它列入编译输入，否则会出现同名双产物并静默漂移。

---

## 🔗 上游

原仓 https://github.com/DietrichGebert/ponytail（MIT）

## 📄 许可

[MIT](LICENSE)
© DietrichGebert / Wenaixi
