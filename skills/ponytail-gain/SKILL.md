---
name: ponytail-gain
description: >
  以精简看板展示 ponytail 的实测收益：更少代码、更低成本、更快速度，数据来自 benchmark 中位数。一次性展示，非持久模式，也非本仓实时统计。触发词：/ponytail-gain / ponytail gain / ponytail 能省多少 / 展示 ponytail 收益 / ponytail 看板。
---

# Ponytail Gain · 收益看板

被调用时展示此看板。一次性展示：不要切换模式、写 flag 文件或做任何持久化。

数据为已发布的 benchmark 中位数（5 个日常任务：邮箱校验、防抖、CSV 求和、倒计时、限流器；3 个模型：Haiku、Sonnet、Opus），是实测值而非基于当前仓库计算。来源：`assets/benchmark-3model.svg` 与 `assets/benchmark-agentic.svg`（本仓库无 `benchmarks/` 目录，数字只存在于这两张图里）。

## 看板

用纯 ASCII 条形图渲染，条形长度表示实测区间，标签给出精确数值：

```
  ponytail gain                     benchmark 中位数 · 5 任务 · 3 模型

  代码行数    无技能  ████████████████████  100%
              ponytail  ██▌·················    6–20%   ▼ 80–94%
  成本        无技能  ████████████████████  100%
              ponytail  █████▌··············   23–53%  ▼ 47–77%
  速度        ponytail  ▸ 3–6× 更快

  本仓：  /ponytail-debt （已延期的捷径）
          /ponytail-audit（仍可删的地方）
```

## 诚实边界

这些是 benchmark 中位数，不是本仓数据。永远不要打印针对本仓的节省数字（例如「本仓节省了 X 行/Token」）：没写的版本从未存在，因此在真实仓库中没有可对比的基线。唯一真实的本仓数字来自 `/ponytail-debt`（已计数的台账），本卡片也会指向那里，而不是凭空捏造。

## 边界

一次性展示，不改任何东西，不切换模式。
「stop ponytail / 正常模式」可退出。
