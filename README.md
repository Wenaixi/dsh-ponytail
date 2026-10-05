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
> **版本对照（2026-10-05 核验）**：本地发行版本为 `5.1.0`；上游参考版本为 `4.10.3`。上游参考版本不会自动决定本地版本号。

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
| `ponytail-config.js` | `src/ponytail-config.ts`（`env > Profile 补丁 > full`，`review` 不可默认） |
| `ponytail-instructions.js` | `src/ponytail-instructions.ts`（唯一出口 `renderPromptSection(skillDir, state)`：review 短路 + 按档裁剪 + 中文 fallback 全部内聚） |
| `ponytail-state.js` | `src/ponytail-state.ts`（`.ponytail-active` 物理存取内联于此——上游 runtime 的 flag 存取已并入 state，DSH 单一宿主无外部探针；技能禁用 reload 收敛同在此） |
| `ponytail-activate.js` | `src/ponytail.ts` 的 `agent/created`（startup/resume 对齐 flag） |
| `ponytail-mode-tracker.js` | `src/ponytail-commands.ts` 的 `createCommandDispatcher`（指令解析纯函数 + 状态机副作用） |
| `ponytail-subagent.js` | `src/ponytail.ts` 的 `agent/created`（`PONYTAIL_SUBAGENT_MATCHER`） |

```
启动:  env PONYTAIL_DEFAULT_MODE → cordis defaultMode → full
       → setMode(flag 文件)   // 会话启动对齐语义，见下方说明

每轮请求前: agent/pre-step (waterfall, 必须 return next())
            → 解析 /ponytail 族 / stop ponytail → 切 currentMode + 写 flag → next()

注入: systemPrompt:section { name: ponytail, order: 50 }
      order 50 在 persona(0) 之后、工具(100) 之前；回调收敛为单行 text: () => renderPromptSection(skillDir, state)
      off → 空，review → 指向技能，读盘失败 → 中文 fallback，assembly 前以 readMode() 对齐

持久化: /ponytail default <mode> → 写入 profile 补丁或 profile 内 config.json
子智能体: PONYTAIL_SUBAGENT_MATCHER 正则（非法 warn 回退），共享同一 section
HMR: 全部走 ctx，热重载逆序自动清理
```

`systemPrompt` 而非 `agent.inject`：落入日志可重建，`order: 50` 优先级高，每次 `assemble` 动态求值，`off` 零成本。flag（`.ponytail-active`）与配置同源持久化在当前 profile 内（`profiles/<name>/ponytail/`），`/ponytail` 切换在 DSH 内闭环。作用域随 profile 隔离，同机多实例互不干扰。

**会话启动对齐**：每次会话启动都会按默认档（env > patch > full）重写 flag，这是对齐上游 SessionStart 语义。因此 `/ponytail <档>` **只在本会话生效**；要让某个等级跨会话持久化，必须用 `/ponytail default <档>` 写进配置文件。

## ⚙️ 配置

```yaml
- insert:
    - id: ponytail
      name: "@wenaixi/dsh-ponytail"
      config:
        providerName: ponytail
        defaultMode: full  # off|lite|full|ultra
```

优先级（三级，取第一个有效值）：`PONYTAIL_DEFAULT_MODE` env > `cordis.defaultMode` > 内置兜底 `full`。持久化：`/ponytail default <mode>` 写入 profile 补丁，`review` 不可作默认。

**注意**：`Config.defaultMode` 的 Schema 刻意不带默认值。Cordis 校验会把缺省 fill 成显式配置——补丁里显式写 `full` 与什么都不写会读出同一个值，诊断面板就无法区分"用户配过"与"没配过"，界面因此说谎。

### 安装：条目必须写在补丁顶层

插件包自带的 `cordis.patch.yml` 用的是 `insert` 列表：

```yaml
- insert:
    - id: ponytail
      name: "@wenaixi/dsh-ponytail"
```

**面板写不进去配置，绝大多数情况是因为补丁条目不是顶层条目。** 宿主的配置编辑器（`dsh-config-editor`）只为顶层条目管理 `config` 块：`edit()` 写入前会把新配置与"继承层"合成结果逐字段比对，不一致就抛 `Configuration for "ponytail" is overridden by a home patch or command-line overlay`（`lib/index.js:121`），面板收到的是「本部署没有接受这次修改」。`insert` 里的条目不参与该比对，条目永远判为被覆盖。

卡片能渲染不代表能写。界面上的判据是 `settings/describe` 的 `writable` 与是否出现那句拒绝提示——本插件自己的卡片不显示只读横幅，所以要看提示文案。

顶层的等价写法（可直接粘进 profile 的 `cordis.patch.yml`）：

```yaml
- id: ponytail
  name: "@wenaixi/dsh-ponytail"
  config:
    defaultMode: full  # off|lite|full|ultra
```

注意两种形态不能混用：profile 补丁里若已有顶层 `- id: ponytail`，插件包 `insert` 进来的同 id 条目会被宿主合并；反之亦然。

### 界面配置

插件在已安装插件卡片详情内嵌配置面板（`plugins.bundle.config` 插槽），支持运行等级、6 个技能的独立开关、一键恢复默认，并给出**三级优先级诊断链**——逐行显示环境变量、Profile 补丁、内置兜底各自的值与生效状态，被更高优先级压制的那一级会显式标为"被覆盖"。只有环境变量命中时等级选择器才禁用（env 压过一切，此时改补丁确实无效）；兜底命中属于"补丁与 env 都没写"，不是更高优先级的配置，必须放行。

等级控件只显示**补丁里真实配置的档**，不回退到运行时推导档：没配过时选中末尾追加的「未设置」段并给出提示，「当前生效」由链表的 `priority.intro` 独占呈现。这是刻意的——把兜底档显示成已配置档，界面就在说谎。

面板不使用自制 HTTP 端点，读写分两条官方通道：

| 通道 | 内容 | 落点 |
| --- | --- | --- |
| `ctx.configForms.get('ponytail')` | 默认档、技能启用列表（写入自带 revision 冲突检测） | Profile 补丁 `profiles/<name>/cordis.patch.yml` |
| `ctx.remote.ponytail.snapshot()` | 当前生效等级、三级优先级诊断链（只读） | 不落盘，按需拉取 |

在无 Profile 上下文的组合（headless / CLI）里，宿主没有装配 Settings 服务，此时配置读写回退到 profile 内的 `ponytail/config.json`。从旧版本升级时，全局共享的 `$DSH_HOME/ponytail/config.json` 会在首次启动时一次性导入 Profile 补丁，随后旧文件被改名为 `config.json.imported`；导入失败不影响启动，可用 `/ponytail default <档>` 重新设置。

### 安装、更新与卸载的真实行为

| 动作 | 需要重启宿主？ | 原因 |
| --- | --- | --- |
| 新装插件 | 否，刷新浏览器即可 | 宿主检测到新增条目，会投递新的产物指纹 |
| **更新已装插件** | **是，必须重启宿主** | 条目 `rev` 在进程启动时算好并冻结；运行中替换 `node_modules` 里的文件不会触发重算 |
| 卸载插件 | 否，但需手工清补丁条目 | `dsh plugin remove` 只清 `package.json` / bundles / 物理包，**不删 `cordis.patch.yml` 的条目**；残留后每次启动打印 `patch: entry "ponytail" not found`（警告，不致命）。删掉该段后 `--dump-config` 恢复 exit 0 |

实测（2026-10-05，隔离 profile，真实 npm registry）：

- 新装：boot 条目 76 → 77，**只刷新浏览器**即出现并可用，宿主无需重启。
- 更新：磁盘上已是 5.1.0（`lib/client.js` 27625 字节、含新的 remote 贡献），但刷新后拿到的 entry `rev` 与升级前**完全相同**、产物仍是 5.0.0（16643 字节）。页面确实重载了（`boot.rev` 变了），是**条目指纹在进程启动时冻结**。重启宿主后才是新版。
- 卸载：三处（`package.json` 依赖键、bundles 条目、物理包目录）都清干净，刷新浏览器后卡片消失；但补丁条目残留需手工删。

**因此更新后请重启宿主再验证界面**。这是宿主运行时边界，插件侧不绕开。卸载残留同样属宿主能力缺口：`dsh-plugin-manager` 唯一的补丁写操作是切换 `disabled`，没有删除条目的能力。

旧的平台位置（`%APPDATA%` / `XDG_CONFIG_HOME` / `~/.config`）兼容读取已随 1A 下沉一并删除；`scripts/verify.mjs` 现在对 `src/` 下任何平台路径字面量直接判失败。

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

- **版本策略**：本地发行版本使用独立的标准 SemVer，例如当前 `5.1.0`；使用 `pnpm version:bump` 递增 patch，或 `pnpm version:set -- 5.1.1` 设置明确版本。旧的 `-dsh.N` 仅属于历史版本策略，不再生成。
- **上游参考**：README 记录上游参考版本和核验日期，但上游发布不会自动改变本地版本；是否升级参考实现由本地兼容性评估决定。
- **发布铁律**：严禁本地 `npm publish` 和未经授权的 `git push`。本地完成门禁后，由授权的 CI tag 流程发布 npm 与 GitHub Release。
- **客户端产物单一来源**：`lib/client.js` 只由 `scripts/build-client.mjs` 生成。`tsconfig.build.json` 不得把它列入编译输入，否则会出现同名双产物并静默漂移。

---

## 🔗 上游

原仓 https://github.com/DietrichGebert/ponytail（MIT）

## 📄 许可

[MIT](LICENSE)
© DietrichGebert / Wenaixi
