# dsh-ponytail

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/@wenaixi%2Fdsh-ponytail?label=npm&color=CB3837)](https://www.npmjs.com/package/@wenaixi/dsh-ponytail)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-Plugin-7c3aed)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/node-%3E%3D20-5FA04E)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-F69220)](https://pnpm.io)

<p align="center">
  <img src="./assets/logo.png" alt="@wenaixi/dsh-ponytail" width="128" height="128"><br/>
  <em>最优秀的代码，就是你从未写出的代码。</em>
</p>

[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) 的 DeepSeek Harness (DSH) 移植版，独立维护（ADR-0010）。把著名的七阶梯子直接注入系统提示词，提供 6 个原生技能，不注册任何模型 tool。

## 是什么

对抗 AI 样板代码与过度工程的解药：删减优于新增，平实优于精巧，文件越少越好。动手写代码前先质疑需求是否该存在（YAGNI），优先复用标准库与现有代码，能写一行就绝不写五十行。

具备**全场景零缓存破坏架构**（ADR-0012）：会话初始基线终身锁定，动态切档通过当前轮次末尾追加系统提醒生效，长对话历史 Prompt Cache / KV 缓存 **100% 保持命中**。以纯净 `dsh.bundle` 交付，不往用户目录写垃圾文件，卸载干净，HMR 自动热重载。

## 安装

需要 DSH 运行时（`npm i -g @deepseek-ai/dsh`），Node 与 pnpm 的版本要求见上方徽章。示例以 `web` profile 为例，换成你自己的 profile 名字即可。

```bash
# 安装（自动触发 HMR 热重载）
dsh plugin --profile web add @wenaixi/dsh-ponytail

# 卸载
dsh plugin --profile web remove @wenaixi/dsh-ponytail

# 检查合成配置树
dsh --profile web --dump-config | grep -A2 ponytail
```

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

## 包含技能

| 技能 | 作用 |
|---|---|
| `/ponytail` | 核心模式：七阶梯子、懒人资深工程师守则 |
| `/ponytail-review` | 猎杀复杂度代码评审：只看 diff，找能删的东西 |
| `/ponytail-audit` | 全仓过度设计审计：按可删收益排序 |
| `/ponytail-debt` | 收割 `ponytail:` 注释列成待办台账 |
| `/ponytail-gain` | 精简收益看板：实测代码缩减比例 |
| `/ponytail-help` | 模式、命令与技能速查卡 |

## 技能正文与描述语言

技能正文是上游 DietrichGebert/ponytail v4.10.3 的英文原文，按 tag 逐文件取回。两处内容对 DSH 不适用，已就地改写为真实落点：`ponytail-gain` 的数据来源指向 `assets/*.svg`（本仓无上游的 `benchmarks/`），`ponytail-help` 的配置与更新章节改为 profile 补丁与 `dsh plugin`。

模型目录与配置面板看到的是同一个描述字符串，语言由 `skillDescriptionLang` 决定（三态：显式中文 `zh` / 显式英文 `en` / 未配置 `auto`）。未配置时跟随宿主语言 `locale.preference` 的显式选择（仅英文触发对齐，其余兜底中文）；显式选择即锁定。两套描述的真源是 `skills/descriptions.zh.json` 与 `skills/descriptions.en.json`，经 `ctx.remote.ponytail.snapshot()` 下发。

## 配置面板

已安装插件的卡片详情内嵌配置面板：运行等级、6 个技能的独立开关、一键恢复默认，外加一条三级优先级诊断链，逐行显示环境变量、Profile 补丁、内置兜底各自的值与生效状态。

等级控件只显示补丁里真实配置的档。补丁没写 `defaultMode` 时选中末尾追加的「未设置」段，「当前生效」由诊断链顶部的文字给出。

读写走两条官方通道：

| 通道 | 内容 | 落点 |
|---|---|---|
| `ctx.configForms.get('ponytail')` | 默认档、技能启用列表，写入自带 revision 冲突检测 | `profiles/<name>/cordis.patch.yml` |
| `ctx.remote.ponytail.snapshot()` | 当前生效等级、三级诊断链，只读 | In-memory RPC |

无 Profile 上下文的组合（headless、CLI）没有 Settings 服务，配置读写回退到 `profiles/<name>/ponytail/config.json`。从旧版本升级时，全局的 `$DSH_HOME/ponytail/config.json` 首次启动时一次性导入 Profile 补丁，旧文件随后被改名 `.imported`。

## 上游映射

上游 `hooks/` 的六个 Hook 合并进单一 DSH 插件：

| 上游 | DSH 侧 |
|---|---|
| `ponytail-config.js` | `src/ponytail-config.ts` |
| `ponytail-instructions.js` | `src/ponytail-instructions.ts` (单一出口 `renderPromptSection`) |
| `ponytail-state.js` | `src/ponytail-state.ts` (flag 文件存取、会话基线管理、重载) |
| `ponytail-activate.js` | `src/ponytail.ts` (`agent/created` 钩子) |
| `ponytail-mode-tracker.js` | `src/ponytail-commands.ts` (`createCommandDispatcher`) |
| `ponytail-subagent.js` | `src/ponytail.ts` (`agent/created`, `PONYTAIL_SUBAGENT_MATCHER`) |

提示词经 `systemPrompt.section('ponytail')` 注入，`order: 50` 落在 persona(0) 与工具(100) 之间。切换到 `off` 时，提示词生成零成本。标志文件与配置同源持久化在当前 profile 内，同机多实例互不干扰。

## 开发与门禁

```bash
pnpm typecheck              # tsc --noEmit
pnpm build                  # tsc 出 lib/，再由 build-client.mjs 生成 lib/client.js
node scripts/verify.mjs     # 静态门禁：产物、技能、零 tool、UI 落点、locale 键集
node scripts/docs-verify.mjs # 版本策略与双语文档一致性
node scripts/behavior.test.mjs  # 行为测试 (112 项全通)

dsh --profile web --patch ./cordis.patch.yml --dump-config  # 验证补丁解析
pnpm dsh web --patch ./cordis.patch.yml   # 热重载联调
```

## 协议

MIT，详见 [LICENSE](./LICENSE)。

## 致谢

- 上游 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件架构与运行底座
- [dsh-plugin-dev](https://github.com/Wenaixi/dsh-plugin-dev) 提供的 DSH 插件开发架构规范与权威开发指南
