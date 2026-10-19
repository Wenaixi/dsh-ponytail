# dsh-ponytail

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/@wenaixi%2Fdsh-ponytail?label=npm&color=CB3837)](https://www.npmjs.com/package/@wenaixi/dsh-ponytail)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-Plugin-7c3aed)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/node-%3E%3D20-5FA04E)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-F69220)](https://pnpm.io)

<p align="center">
  <img src="./assets/logo.png" alt="@wenaixi/dsh-ponytail" width="128" height="128"><br/>
  <em>最好的代码就是你从未写过的代码。</em>
</p>

这是 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) 的 DeepSeek Harness（DSH）移植版，由我们独立维护（ADR-0010）。它把七阶梯子直接写进系统提示词，附带 6 个专项技能，不注册任何 tool。

## 它是什么

为了对抗 LLM 的样板代码和过度设计，我们提倡删减而非添加，追求无聊而非巧妙，文件越少越好。写代码之前先问一句这需求是否真的需要存在（YAGNI），优先复用已有的函数和标准库，能一行解决就别写五十行。

它还带一套**零缓存破坏架构**（ADR-0012）：会话的初始基线一旦确定就终身不变，运行中切换强度只靠在当前轮次末尾追加一条系统提醒生效，长对话里历史的 Prompt Cache / KV 缓存命中率始终保持在 100%。插件以纯净的 `dsh.bundle` 形式交付，不往你的家目录写任何垃圾文件，卸载时删得干干净净，改动通过 HMR 自动重载。

## 安装

需要先装 DSH 运行时（`npm i -g @deepseek-ai/dsh`），Node 和 pnpm 的最低版本见上方徽章。下面的示例用 `web` 这个 profile，换成你自己的 profile 名即可。

```bash
# 安装（自动触发 HMR 热重载）
dsh plugin --profile web add @wenaixi/dsh-ponytail

# 卸载
dsh plugin --profile web remove @wenaixi/dsh-ponytail

# 检查合成后的配置树
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

每次新会话启动时，强度会按 `env > Profile 补丁 > 内置兜底 full` 这条链重新确定，所以 `/ponytail <档>` 只在当前会话里有效。想让设置在重启和新会话之后依然保留，请用 `/ponytail default <档>`。

### 零缓存破坏架构

在会话进行中切换强度，或者修改全局默认配置时，顶层系统提示词基线保持**逐字节完全相同，不带任何变化**。

档位切换通过在当前轮次用户消息的末尾追加一条增量系统提醒（`<system-reminder>`）来动态生效，这套做法与官方 `dsh-tool-skill` 的目录更新范式一致（ADR-0012）。因此**历史的 KV Cache / Prompt Cache 被完整保护**，覆盖全部多轮对话历史，不会再为重新计算前缀付出高昂代价，也不会出现延迟尖峰。

## 包含技能

| 技能 | 作用 |
|---|---|
| `/ponytail` | 核心模式：七阶梯子，资深懒人工程师的思维习惯 |
| `/ponytail-review` | 过度设计代码评审：专门找那些能删掉的代码 |
| `/ponytail-audit` | 全仓复杂度审计，按可删除的收益排序 |
| `/ponytail-debt` | 收集 `ponytail:` 注释，整理成可以执行的债务台账 |
| `/ponytail-gain` | 极简指标看板，展示代码缩减的实测基准 |
| `/ponytail-help` | 模式、命令与技能的速查卡 |

## 技能正文与描述语言

技能正文全部取自上游 DietrichGebert/ponytail v4.10.3，按原样保留英文。有两处内容在 DSH 里不适用，我们改成了真实的落点：`ponytail-gain` 的数据来源指向本仓的 `assets/*.svg`（上游的 `benchmarks/` 目录没有随仓库带过来），`ponytail-help` 的配置与更新章节改为介绍 profile 补丁和 `dsh plugin`。

模型目录和配置表单里看到的描述文字是同一个字符串，具体显示哪种语言由 `skillDescriptionLang` 决定，它有三种状态：显式中文 `zh`、显式英文 `en`、以及未配置的 `auto`。未配置时跟随宿主 `locale.preference` 的设置（选中英文就对齐英文，其他情况一律回落中文）。一旦显式选定，语言就锁定不变。两套描述的真源分别是 `skills/descriptions.zh.json` 和 `skills/descriptions.en.json`，通过 `ctx.remote.ponytail.snapshot()` 实时下发。

## 配置面板

已安装插件的卡片详情里内嵌了一块配置面板，包含强度等级控制、6 个技能各自的独立开关、一键重置按钮，以及一条三级优先级诊断链，逐项显示环境变量、profile 补丁和内置兜底当前的值与是否生效。

等级分段控件只反映真正持久化下来的配置。如果补丁里没有写 `defaultMode`，控件就会高亮末尾追加的那一段 `unset`。当前实际运行的等级则单独显示在诊断区的标题文字里，两者不会混淆。

配置的读取和写入走 DSH 的两条官方通道：

| 通道 | 范围 | 落点 |
|---|---|---|
| `ctx.configForms.get('ponytail')` | 默认等级与禁用的技能，写入时自带 revision 冲突检测 | `profiles/<name>/cordis.patch.yml` |
| `ctx.remote.ponytail.snapshot()` | 当前运行的等级与三级诊断链（只读） | In-memory RPC |

如果某个 profile 没有完整的 UI 服务组合（比如 headless、CLI 这类环境），配置会自动平稳回退到 `profiles/<name>/ponytail/config.json`，与最新的 DSH 纯净 profile 架构完全一致。

## 上游映射

上游 `hooks/` 里的六个 hook 被合并进一个 DSH Cordis 插件：

| 上游 | DSH 中的实现 |
|---|---|
| `ponytail-config.js` | `src/ponytail-config.ts` |
| `ponytail-instructions.js` | `src/ponytail-instructions.ts`（单一出口 `renderPromptSection`） |
| `ponytail-state.js` | `src/ponytail-state.ts`（flag 文件读写、会话基线管理、重载） |
| `ponytail-activate.js` | `src/ponytail.ts`（`agent/created` 钩子） |
| `ponytail-mode-tracker.js` | `src/ponytail-commands.ts`（`createCommandDispatcher`） |
| `ponytail-subagent.js` | `src/ponytail.ts`（`agent/created`、`PONYTAIL_SUBAGENT_MATCHER`） |

提示词通过 `systemPrompt.section('ponytail')` 注入，位置在 `order: 50`，正好夹在 `persona`（0）和工具（100）之间。切到 `off` 之后，生成提示词的开销为零。标志文件和配置都按 profile 目录各自保存，多实例之间完全隔离。

## 开发与门禁

```bash
pnpm typecheck              # tsc --noEmit
pnpm build                  # tsc 出 lib/，再由 scripts/build-client.mjs 生成 lib/client.js
node scripts/verify.mjs     # 静态契约门禁：产物、技能、零 tool、落点、locale
node scripts/docs-verify.mjs # 文档与版本一致性门禁
node scripts/behavior.test.mjs  # 行为测试套件（113 项全通）

dsh --profile web --patch ./cordis.patch.yml --dump-config  # 验证补丁解析
pnpm dsh web --patch ./cordis.patch.yml   # 热重载联调
```

## 协议

MIT，全文见 [LICENSE](./LICENSE)。

## 致谢

- 上游项目 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供的插件架构与运行底座
- [dsh-plugin-dev](https://github.com/Wenaixi/dsh-plugin-dev) 提供的 DSH 插件开发范式与架构规范
