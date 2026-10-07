# dsh-ponytail

<p align="center">
  <img src="assets/logo.png" width="180" alt="Ponytail" />
</p>

<p align="center">
  懒惰的资深工程师，移植到 DeepSeek Harness。<br/>
  <em>The best code is the code you never wrote.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT"/></a>
  <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail"><img src="https://img.shields.io/npm/v/@wenaixi/dsh-ponytail?color=111111&style=flat-square" alt="npm"/></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <b>简体中文</b> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/DietrichGebert/ponytail">上游</a> ·
  <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail">npm</a>
</p>

面向 DeepSeek Harness 的常驻插件：把七阶梯子注入系统提示词，提供 6 个中文技能，不注册任何 tool。实现参考 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)，本地版本与上游参考版本独立维护。

## 安装

装到任意 profile。示例里的 `web` 换成你的 `--profile <name>`。

```bash
dsh plugin --profile web add @wenaixi/dsh-ponytail
dsh plugin --profile web remove @wenaixi/dsh-ponytail
dsh --profile web --dump-config | grep -A2 ponytail
```

`WARN missing peer @deepseek-ai/...` 是正常的，peer 由 DSH 运行时提供。看到 `Packages: +2 Done` 就是装好了。

若插件卡片只有包名、没有标题描述图标，说明包的 `exports` 没放行 `./package.json` 与 `./locale/*.json`。这是 DSH 读取展示元信息的硬约束，与安装本身无关。

### 安装与热加载

支持完全零配置热安装。`dsh plugin add` 将插件包登记至 `package.json` 与 bundle 列表后，宿主 HMR 会自动重载 Loader 树并挂载配置卡片：

```bash
dsh plugin --profile web add @wenaixi/dsh-ponytail@5.3.2
```

安装完成后等待 2 至 3 秒（文件监听器防抖期），在浏览器中刷新页面即可使用。无需手动编辑 `cordis.patch.yml`。

说明：
- 首次安装无需重启宿主，刷新浏览器即可。
- 原地更新已安装版本时，宿主受条目指纹冻结机制限制，建议重启宿主或通过卸载后重新安装加载新产物。

## 用法

```
/ponytail            切到 full（七阶梯子全开）
/ponytail lite       只做最低限度
/ponytail ultra      先挑战需求本身
/ponytail off        关闭注入
/ponytail default lite   跨会话持久化
stop ponytail        同 off，整句匹配
```

等级在每次会话启动时按 `env > Profile 补丁 > 内置兜底 full` 重置，所以 `/ponytail <档>` 只在本会话有效，跨会话要写 `/ponytail default <档>`。

### 零缓存破坏特性 (Prompt Cache Friendly)

会话内切档或全局改配置时，顶层系统提示词基线严格保持静态恒定，切换指令通过当前轮次用户消息末尾的 `<system-reminder>` 增量追加生效（对齐官方技能目录更新范式，ADR-0012），**100% 保护长对话的历史 Prompt Cache / KV 缓存**，零重算延迟，零多余 Token 消耗。

六档之外的技能：

| 技能 | 作用 |
| --- | --- |
| `/ponytail-review` | 只看 diff，找能删的东西 |
| `/ponytail-audit` | 全仓审计，按可删收益排序 |
| `/ponytail-debt` | 收割 `ponytail:` 注释列成待办 |
| `/ponytail-gain` | 收益看板 |
| `/ponytail-help` | 速查卡 |

命令行调试时任务文本不要写 `headless`，否则整句匹配不上 `/ponytail` 前缀：

```bash
dsh --profile web '<任务>'
```

## 技能正文与描述语言

技能正文是上游 DietrichGebert/ponytail v4.10.3 的英文原文，按 tag 逐文件取回。两处内容对 DSH 不适用，已就地改写为真实落点：`ponytail-gain` 的数据来源指向 `assets/*.svg`（本仓无上游的 `benchmarks/`），`ponytail-help` 的配置与更新章节改为 profile 补丁与 `dsh plugin`。

模型目录与配置面板看到的是同一个描述字符串，语言由 `skillDescriptionLang` 决定（三态：显式中文 / 显式英文 / 未配置）。未配置时跟随宿主语言 `locale.preference` 的显式选择（仅英文触发对齐，其余兜底中文）；显式选择即锁定。两套描述的真源是 `skills/descriptions.zh.json` 与 `skills/descriptions.en.json`，经 `ctx.remote.ponytail.snapshot()` 下发，因此切换后模型侧与界面同时改变。

描述长度上限来自官方 `dsh-tool-skill` 的 `catalogDescriptionMaxLength`（默认 500），超长会在模型目录里被截断，`verify.mjs` 对两册都断言。

## 配置面板

已安装插件的卡片详情内嵌配置面板：运行等级、6 个技能的独立开关、一键恢复默认，外加一条三级优先级诊断链，逐行显示环境变量、Profile 补丁、内置兜底各自的值与生效状态。

等级控件只显示补丁里真实配置的档。补丁没写 `defaultMode` 时选中末尾追加的「未设置」段，「当前生效」由诊断链顶部的文字给出。把兜底档显示成已配置档就是在骗人。

读写走两条官方通道：

| 通道 | 内容 | 落点 |
| --- | --- | --- |
| `ctx.configForms.get('ponytail')` | 默认档、技能启用列表，写入自带 revision 冲突检测 | `profiles/<name>/cordis.patch.yml` |
| `ctx.remote.ponytail.snapshot()` | 当前生效等级、三级诊断链，只读 | 不落盘，按需拉取 |

无 Profile 上下文的组合（headless、CLI）没有 Settings 服务，配置读写回退到 `profiles/<name>/ponytail/config.json`。从旧版本升级时，全局的 `$DSH_HOME/ponytail/config.json` 首次启动时一次性导入 Profile 补丁，旧文件随后被改名 `.imported`；导入失败不影响启动。

## 安装、更新、卸载的真实行为

| 动作 | 需要重启宿主 | 原因 |
| --- | --- | --- |
| 新装 | 否，刷新浏览器即可 | 宿主检测到新增条目，投递新的产物指纹 |
| 更新 | 是 | 条目 `rev` 在进程启动时算好就冻结，运行中替换文件不触发重算 |
| 卸载 | 否，但补丁条目要手工删 | `dsh plugin remove` 清 `package.json`、bundles 与物理包，不删 `cordis.patch.yml` 的条目 |

卸载后的残留条目每次启动打印 `patch: entry "ponytail" not found`，是警告，不致命。宿主侧确实没有删除条目的能力，只能手工清。

更新后请重启宿主再验证界面。

## 上游映射

上游 `hooks/` 的六个 Hook 合并进单一 DSH 插件：

| 上游 | DSH 侧 |
| --- | --- |
| `ponytail-config.js` | `src/ponytail-config.ts` |
| `ponytail-instructions.js` | `src/ponytail-instructions.ts`，唯一出口 `renderPromptSection(skillDir, state)` |
| `ponytail-state.js` | `src/ponytail-state.ts`，flag 文件存取、会话基线管理与技能禁用 reload |
| `ponytail-activate.js` | `src/ponytail.ts` 的 `agent/created` |
| `ponytail-mode-tracker.js` | `src/ponytail-commands.ts` 的 `createCommandDispatcher` |
| `ponytail-subagent.js` | `src/ponytail.ts` 的 `agent/created`，`PONYTAIL_SUBAGENT_MATCHER` |

提示词经 `systemPrompt.section('ponytail')` 注入，`order: 50` 落在 persona(0) 与工具(100) 之间，每次 assemble 动态求值，`off` 时零成本。flag 与配置同源持久化在当前 profile 内，同机多实例互不干扰。

## 开发

```bash
pnpm typecheck              # tsc --noEmit
pnpm build                  # tsc 出 lib/，再由 build-client.mjs 生成 lib/client.js
node scripts/verify.mjs     # 静态门禁：产物、技能、零 tool、UI 落点、locale 键集
node scripts/docs-verify.mjs # 版本策略文档一致性
node scripts/behavior.test.mjs  # 行为测试 (102 项全通)

dsh --profile web --patch ./cordis.patch.yml --dump-config  # 只验证补丁解析
pnpm dsh web --patch ./cordis.patch.yml   # 热重载
```

本地版本用独立的标准 SemVer，`pnpm version:bump` 递增 patch，`pnpm version:set -- 5.3.2` 指定版本。旧的 `-dsh.N` 不再生成。上游发布不会改变本地版本号，是否吸收上游变化由本地兼容性评估决定。

发布只走 tag 触发的 CI。严禁本地 `npm publish`，push 与打 tag 都需要明确授权。

`lib/client.js` 只由 `scripts/build-client.mjs` 生成。`tsconfig.build.json` 不能把它列入编译输入，否则会出现同名双产物并静默漂移。

## 许可

[MIT](LICENSE)，原作 DietrichGebert，移植 Wenaixi。上游仓库 https://github.com/DietrichGebert/ponytail
