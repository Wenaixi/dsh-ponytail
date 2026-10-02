---
name: ponytail-help
description: >
  ponytail 全量模式、技能与命令的速查卡，一次性展示，非持久模式。触发词：/ponytail-help / ponytail help / ponytail 有哪些命令 / 怎么用 ponytail。
---

# Ponytail Help · 速查卡

被调用时展示此速查卡。一次性展示，不要切换模式、写 flag 文件或做任何持久化。

## 等级

| 等级 | 触发 | 变化 |
|-------|---------|------|
| **Lite** | `/ponytail lite` | 按要求构建，但在同一行里点出更懒的替代方案。 |
| **Full** | `/ponytail` | 强制走梯子：YAGNI → 标准库 → 原生 → 一行 → 最小实现。默认。 |
| **Ultra** | `/ponytail ultra` | YAGNI 极端派，先删后加，在构建前先挑战需求本身。 |

等级会保持到被修改或会话结束。

## 技能

| 技能 | 触发 | 作用 |
|-------|---------|------|
| **ponytail** | `/ponytail` | 懒人模式本体，用最简可用的解法。 |
| **ponytail-review** | `/ponytail-review` | 过度设计评审：`L42: yagni: 工厂只有一个产品，直接内联。` |
| **ponytail-audit** | `/ponytail-audit` | 全仓过度设计审计：按可删行数排序的清单。 |
| **ponytail-debt** | `/ponytail-debt` | 收割 `ponytail:` 捷径注释，生成待办台账。 |
| **ponytail-gain** | `/ponytail-gain` | 实测收益看板：更少代码、更低成本、更快速度。 |
| **ponytail-help** | `/ponytail-help` | 本卡片。 |


## 退出

说「stop ponytail / 正常模式」即可退出，随时用 `/ponytail` 恢复。
`/ponytail off` 同样可用。

## 配置默认等级

默认等级为 `full`，每会话自动激活。修改方式：

**环境变量**（优先级最高）：
```bash
export PONYTAIL_DEFAULT_MODE=ultra
```

**配置文件**（`$DSH_HOME/ponytail/config.json`，默认 `~/.dsh/ponytail/config.json`）：
```json
{ "defaultMode": "lite" }
```

设为 `"off"` 可关闭会话启动时的自动激活，需要时再用 `/ponytail` 手动开启。

优先级：环境变量 > 配置文件 > `full`。

## 更多

完整文档与示例：https://github.com/DietrichGebert/ponytail
