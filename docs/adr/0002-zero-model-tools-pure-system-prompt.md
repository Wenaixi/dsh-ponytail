# 2. 坚持零 Model Tool 注册，纯粹依靠 SystemPrompt 梯子运作

- **状态 (Status)**: 已采纳 (Accepted)
- **日期 (Date)**: 2026-10-02
- **决策者 (Deciders)**: Ponytail 架构小组

## 背景与上下文 (Context)
在 DSH 插件体系中，插件可以通过 `ctx.tools` 注册供模型直接调用的 Tool，也可以通过 `ctx.systemPrompt.section` 注入系统级提示词，或通过 `ctx.skills` 提供按需技能。

Ponytail 的核心目标是改变模型的思维模式（“懒惰的高级工程师”心智模型），而非为模型提供外部工具能力。

## 架构决断 (Decision)
**本项目坚决不向 `ctx.tools` 注册任何 Tool。**
所有行为引导纯粹依靠：
1. `systemPrompt.section('ponytail')`：透明注入梯子七阶与当前强度的行为守则；
2. 6 个原生内置技能（`skills/ponytail*`）：按需提供 review、audit、debt、gain 等专项能力；
3. `verify.mjs` 门禁：设置全局静态正则断言，硬编码封杀任何向 ctx.tools 注册的行为。

## 影响与后果 (Consequences)
- **正面收益**：极简、安全、零模型上下文调用开销，绝不污染模型工具池，透明可见可回溯；
- **妥协权衡**：无法通过模型 Tool 调用进行程序化状态切换（模式切换统一走命令拦截器或用户自然语言全句失活）。
