# 1. 排除 Cursor 专属运行时与外部脚本

- **状态 (Status)**: 已采纳 (Accepted)
- **日期 (Date)**: 2026-10-02
- **决策者 (Deciders)**: Ponytail 架构小组

## 背景与上下文 (Context)
在上游官方仓库 (`DietrichGebert/ponytail`) 中，为了支持 Cursor 编辑器，引入了检测 `.cursor/rules` 并输出只读规则告警 (`cursorRuleNotice`) 的逻辑，同时包含了针对外部终端环境的 `ponytail-statusline.sh` 和 `ponytail-statusline.ps1`。

在将 Ponytail 移植为 DeepSeek Harness (DSH) 插件时，需要评估是否移植这些外部宿主专属逻辑。

## 架构决断 (Decision)
**明确排除 Cursor 专属规则通知与外部 statusline 脚本。**
插件专注于 DSH 常驻宿主环境，仅保留平台无关的核心动态探针（Copilot / Codex / Qoder / Claude）以兼容潜在的多宿主环境变量，不移植 Cursor 本地工作区规则检查与 shell 状态行。

## 影响与后果 (Consequences)
- **正面收益**：代码体积缩减约 45%，消除了与 DSH 运行环境无关的死代码，避免在常驻进程中维护外部编辑器私有规则的复杂度；
- **妥协权衡**：插件不适用于独立的 Cursor 插件生态（本插件定位为专用 DSH/Cordis 插件，此权衡符合项目最初定位）。

## 修订注记 (Amendment)
第 14 行「仅保留平台无关的核心动态探针（Copilot / Codex / Qoder / Claude）以兼容潜在的多宿主环境变量」
已被收窄：docs/adr/0004-dsh-single-host-runtime.md 决定 DSH 为唯一宿主，四路探针与跨宿主
flag 共存语义全部移除，flag 固定持久化于 DSH 配置目录。
