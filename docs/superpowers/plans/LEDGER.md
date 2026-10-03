# 执行 Ledger — 2026-10-04 架构深挖（plan 内联推进）

## 裁决记录（Ruling）
- R1: 执行方式=内联（executing-plans），用户已选 plan 内联推进，任务间不停下确认。
- R2: **C5 否决（更新）**：官方包 dsh-skill@0.2.0-rc.2 真源（lib/index.js:404, dsh-skill-filesystem/lib/index.js:412-469）证明 skills/change 是给消费方（host UI/agent-loop）的通知缝，不是给提供者的回调；全树零订阅者；本仓 skillDir（包内 ../skills）不在任何观察 roots 内，事件永不触发；监听器内反向调用 control.invalidate() → invalidateCache → notifyChange → 再次 emit → **同步无限递归栈溢出**（invalidate 守卫不抑制重入广播）。正确闭环=C1 修 providerInstance（UI 变更点直调 control.invalidate()，官方模式）。skills/change 空监听保留 debug + 注释说明不可接 invalidate。ADR-0003 不禁止也不要求。
- R3: getDefaultMode 保留不动（commands 无 patch 层 fallback + 无 env trim 行为不变）；apply/UI 的「当前生效默认档」一律改走 resolvePriority().effective（含 trim/归一），行为以 resolvePriority 为准。
- R4: C4 行为变更声明：patch 显式 review/大小写/空白变体从「生效」（注入垃圾态）变为「忽略」（落合法档）——这是归一修复，写入 ADR-0006 与 CLAUDE.md。
- R5: C2 采用 frontmatter 真源方案 A（否 B/manifest）：src 侧 async handler 读 frontmatter（try/catch 守卫），build-client.mjs 构建期提取作 fallback；面板 rowDesc 单行省略；verify 加反向断言。
- R6: C3 写盘统一为字段级 merge（保留未知键），writeFullConfig/writeDefaultMode 变薄包装（导出签名不变）；删 config 版 isDeactivationCommand + normalizeConfigMode 两个孤儿（全仓零调用方）；兼容分支（getLegacy*）不动。
- R7: C6 接入 ctx.locale：register('ponytail', {zh,en}) 键全成对（值可同——技能描述保持中文）；诊断链 label/problem 客户端按 level 覆盖；skillDir 由 deps 注入。
- R8: 每任务全四门禁（typecheck/behavior.test/verify/build）后 commit；不 push 不发版。
