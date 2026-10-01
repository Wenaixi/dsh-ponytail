# 4. DSH 单一宿主运行时（移除多平台探测）

- **状态 (Status)**: 已采纳 (Accepted)
- **日期 (Date)**: 2026-10-02
- **决策者 (Deciders)**: Ponytail 架构小组

## 背景与上下文 (Context)
初始移植（4.9.0-dsh.0）逐行对齐上游 hooks/ponytail-runtime.js，保留了四路动态平台探针
（Copilot / Codex / Qoder / Claude）与「文件为真源、跨宿主共存」的 flag 语义，flag 文件
落在 getClaudeDir()/.ponytail-active（即 ~/.claude 或 CLAUDE_CONFIG_DIR）。

自产品定位确认以来，本插件唯一宿主是 DeepSeek Harness（DSH）常驻进程：
- DSH 常驻进程的环境变量中 COPILOT_PLUGIN_DATA / PLUGIN_DATA / QODER_SESSION_ID /
  CLAUDE_PLUGIN_ROOT 永不为真，四路探针在 DSH 内是恒假死代码；
- ~/.claude 目录属于外部宿主（Claude Code）的领地，DSH 插件向其写入 .ponytail-active
  属越界行为，且当外部宿主存在时将 DSH 的等级状态误共享给非目标进程。

## 架构决断 (Decision)
**收窄为 DSH 单一宿主**：
1. 删除 isCopilot() / isCodex() / isQoder() 三个探针与 resolveStateDir() 的全部
   外部宿主分支，flag 文件（.ponytail-active）固定持久化于 DSH 配置目录
   （$XDG_CONFIG_HOME/ponytail / %APPDATA%\ponytail / ~/.config/ponytail），
   与 config.json 同源；
2. syncFromFile() 文件缺失时无条件清空内存态（移除 Copilot 无独立 data 目录的豁免），
   关闭语义在 DSH 内自洽；
3. 删除 getClaudeDir() 及对其余外部宿主标量的引用。

## 影响与后果 (Consequences)
- **正面收益**：删除恒假死代码与外部宿主变量引用，缩窄 flag 写入范围至 DSH 配置目录，
  消除与 Claude Code / Copilot 等进程的越界状态共享；DSH 状态机语义独立完整。
- **妥协权衡**：flag 位置从 ~/.claude/.ponytail-active 迁移，已有 DSH 安装升级后
  当前等级会重置为默认（full）；与外部宿主跨进程切换等级的能力被有意移除（非产品目标）。
