# ADR-0015: 技能元数据目录内聚与 Remote 传输层解耦 (Skill Catalog Decoupling from Remote Transport)

- **状态**：已采纳 (Accepted)
- **日期**：2026-10-10
- **相关决策**：[ADR-0002](./0002-zero-model-tools-pure-system-prompt.md), [ADR-0011](./0011-skill-description-language-follows-host-locale.md), [ADR-0014](./0014-turn-coordinator-sink-seam-unification.md)

---

## 背景与问题陈述

在经历 ADR-0011 规范技能描述多语言随宿主偏好对齐后，系统的多语言切换机制运转良好。然而在全模块架构审查（`improve-codebase-architecture`）中，发现领域层与传输层之间存在一处明显的**依赖倒置与接缝错位（Inverted Coupling & Leaking Seam）**：

1. **传输层越权承担领域文件解析**：
   `src/ponytail-remote.ts` 本是面向 DSH 客户端的跨端 RPC 适配器（继承 `TypertRemoteService`），但内部却硬编码了 `SKILL_IDS` 技能标识常量、`FALLBACK_DESCRIPTION` 静态短描述字典，并直接从磁盘读取并解析 `skills/descriptions.{lang}.json`。
2. **核心领域模块反向依赖外部适配器**：
   核心技能服务 `src/ponytail-skills.ts`（实现宿主 `SkillProvider` 契约的领域深模块）为了获取多语言描述，反向引入了 `import { readSkillDescriptions } from './ponytail-remote.js'`。
   这违反了 Clean Architecture / 深模块原则：核心业务领域反向依赖了上层的网络传输适配器。

---

## 架构决断

### 1. 领域事实收敛至 `ponytail-skills.ts` 深模块
- 将 `SKILL_IDS`、`SkillLang`、`SkillMeta`、`FALLBACK_DESCRIPTION`、`readSkillDescriptions` 与 `readSkillMeta` 完整内聚至 `src/ponytail-skills.ts`；
- 彻底移除 `ponytail-skills.ts` 头部对 `ponytail-remote.js` 的反向依赖，使技能模块实现完全的领域自洽与单一真源。

### 2. `ponytail-remote.ts` 退回纯粹的 RPC 适配器角色
- 移除传输层多余的文件读取与静态常量维护代码（消减 60+ 行冗余）；
- 保留 `export function readSkillMeta(lang?: SkillLang)` 与 `export function readSkillDescriptions(lang?: SkillLang)` 的导出形状，内部纯粹委托给技能领域层，严格遵循门禁与已有单测契约。

---

## 收益与架构影响

- **Locality（局部性）**：所有技能定义、元数据与多语言短描述统一收归技能领域模块，修改技能体系无需触碰通信协议层；
- **单向无环依赖**：系统调用依赖链条完全摆正为正向单向：`Remote (Adapter) -> Skills (Domain Core)`；
- **深模块纯度**：`ponytail-skills.ts` 成为完全自主自洽的深模块，支持独立测试与复用。
