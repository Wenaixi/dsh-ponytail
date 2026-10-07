# 12. 采用会话基线锁定与当前轮次末尾追加机制实现零缓存破坏模式切换

- **状态 (Status)**: 已采纳 (Accepted)
- **日期 (Date)**: 2026-10-08
- **决策者 (Deciders)**: Ponytail 架构小组

## 背景与上下文 (Context)

在原先的实现中，无论是会话内输入命令切档（如 `/ponytail ultra`、`/ponytail off`），还是外部全局修改默认档（`defaultMode`），插件均直接重写顶层 `systemPrompt.section('ponytail')`（`order: 50`）。

在大语言模型推理与 Prompt Caching（如 Anthropic 提示词缓存、DeepSeek Context Caching、vLLM/SGLang 的 RadixAttention）的前缀匹配体系下：
1. `order: 50` 位于整个 Prompt 序列的最前端（约第 200 个 Token 处）；
2. 一旦该切片文本发生字符级变化，位于该断点之后的**所有工具声明、运行时上下文、以及此前累积的所有多轮对话历史上下文（往往高达数万 Token）全部发生 Cache Miss（缓存失效）**；
3. 服务商必须重新为全量历史重新计算 Prefill，产生严重的首字延迟（TTFT 激增）和巨额非缓存 Token 成本；
4. 全局配置变更时，多会话共享顶层切片，导致正在运行中的其他会话缓存猝然受损。

## 架构决断 (Decision)

**彻底废除直接修改顶层 SystemPrompt 的切档方式，对齐 DSH 官方标准库 `@deepseek-ai/dsh-tool-skill` 的 `renderCatalogUpdate` 范式，建立双层提示词与会话基线隔离体系：**

1. **顶层 SystemPrompt (order: 50) 固化会话基线 (Baseline Mode)**：
   - 每个会话在创建时原子捕获当时的全局默认档快照，固化为 `baselineMode`；
   - 在会话整个生命周期内，`systemPrompt.section('ponytail')` **永远只渲染该 `baselineMode`**；
   - 无论用户在会话内如何切换、无论外部全局配置如何修改，顶层 SystemPrompt 前缀文本**逐字节完全静态恒定**，100% 保护大模型前缀缓存。

2. **当前轮次末尾追加系统通知 (Turn-End System Reminder)**：
   - 监听 `agent/pre-step` 瀑布流拦截点，进行模式变动检测（`effectiveMode !== lastEmittedMode`）；
   - 当模式发生切换时，绝不重写顶层前缀，而是在当前最新轮次用户消息末尾追加一条由 `<system-reminder>` 包裹的模式更新通知（`renderModeUpdate`）；
   - 利用大模型在最新轮次末尾的近因偏差（Recency Bias），大模型在当轮推理时以最高注意力权重即时切换执行最新强度约束；
   - 发射后标记 `markSessionEmitted`，后续未切档对话幂等稳定，绝不重复生成多余 Token。

3. **会话状态隔离与显式意图守卫**：
   - 状态管理器引入 `SessionModeState`，支持带访问序刷新的 LRU 淘汰（上限 100 会话，安全跳过默认项防首键死锁）；
   - 记录 `explicitlySet` 标记，用户在会话内显式设置的档位不受外部全局配置变更冲刷；全局配置变更仅同步未显式设置过的跟随型会话；新会话直接采用新默认档纯净启动。

## 影响与后果 (Consequences)

- **正面收益**：
  - **历史缓存 100% 保持命中**：长对话中任何切档操作均不破坏 0 到 N-1 轮历史 KV Cache，TTFT 零劣化；
  - **Token 消耗极大降低**：单次切档仅产生 ~180 Token 的瞬态增量，后续轮次自然融入稳定缓存基线；
  - **会话高度自洽隔离**：各会话独立保持自身状态，全局配置变更不影响已存在的历史会话；
  - **实现极简**：零外部依赖，完全复用 Node 标准库 `randomUUID` 与现有指令裁剪能力，契合 Ponytail 七阶梯子。
- **妥协权衡**：
  - 首次切档当轮会在最新消息后多占用约 180 Token 的消息长度（工程收益显著大于微量开销）。
