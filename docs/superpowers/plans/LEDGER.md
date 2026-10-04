# 执行 Ledger — 2026-10-04 架构深挖第二轮（plan 内联推进）

## 裁决记录（Ruling）
- R1: 执行方式=内联（executing-plans），用户已选「不问、不停、自我最佳决策」。
- R2: **C5 否决**：宿主 dsh-skill 0.2.0-rc.2 源码（lib/index.js:120-133, 265-296）证明 SkillRegistry 自带 collectCache（revision + invalidateCache + collectCacheKey），list()/snapshot() 命中缓存不调用 provider 的 list()；provider 内再做缓存边际收益≈0。官方 skill-provider.md 第八节的"进程内缓存"建议适用于无宿主缓存的提供者，本场景已被宿主覆盖。
- R3: **C7 实锤（真 bug）**：探针复现 patch='lite'+config 缺失 → resolvePriority.effective='lite' 而 getDefaultMode()='full'；/ponytail foobar 将等级从 lite 切到 full；裸 /ponytail 报告 full。责任在 apply 构造 dispatcher 时未注入 getDefaultMode（src/ponytail.ts:191-195 只注入 state/logger/writeDefaultMode）。
- R4: C7 修复=注入实时闭包 `getDefaultMode: () => resolvePriority({envRaw, patchMode, configMode: readRawConfigMode()}).effective`，不 snapshot（防 /ponytail default 后命令层仍用旧值）；ADR-0006 决策 1 与 LEDGER 首轮 R3 需修订（命令模块 fallback 语义并入 resolvePriority 真源）。
- R5: C1 采用方案 B（补 reloadDisabledSkills + isMainSkillDisabled 纯函数，不拆模块）——YAGNI：技能静态 6 个无动态生命周期，拆两模块复制双写逻辑；补方法 5 行与既有 syncFromFile 同构。
- R6: C2 采用私有 parseConfigObject 收敛（readFullConfig/getDefaultMode 复用；writeFullConfig 保留原始对象读段与未知键；getDefaultMode 无 patch 层/无 trim 语义不动——R3 沿用）。
- R7: C3 随 C2 落地 snapshot 合并（读一次 configMode → 一次 resolvePriority）；行为测试补 1 行不变量断言。
- R8: C6 内联（删 src/ponytail-runtime.ts，fs 三件套并入 state）——净减 1 文件 + ~30 行；verify 清单、behavior import、CONTEXT/README 同步。
- R9: 每任务先跑失败断言（TDD），后门禁，最后 commit；不 push 不发版。

## 第二轮追加裁决（2026-10-04 架构深挖 round2）
- R10: **C4 实锤回归**：build-client.mjs 模板死行（2bdd26d 引入）在浏览器 CJS factory 上下文抛 SyntaxError；删除 + verify 补 Node API 残留断言（先破坏实测再还原）。
- R11: **C7 实锤（真 bug）**：探针复现 patch='lite'+config 缺失 → resolvePriority effective='lite' 而 getDefaultMode()='full'；/ponytail foobar 把等级从 lite 切到 full。修复=dispatcher 注入实时 resolvePriority 闭包（不 snapshot）。
- R12: C2+C3 落地（parseConfigObject 唯一读出口；快照单求值 + defaultMode===priority.effective 锁定）；getDefaultMode 无 patch 层/无 trim 语义不动（沿用 R3）。
- R13: C1 落地（reloadDisabledSkills + isMainSkillDisabled 纯函数，不拆模块——YAGNI）。
- R14: C6 落地（runtime 内联 state，删文件；.gitignore 排除 .local/ 防桌面版调试备份误入仓）。
- R15: **C5 维持否决**：宿主 dsh-skill collectCache 已兜底 list 侧（revision/invalidateCache），provider 内缓存边际收益≈0；官方文档该建议不适用于宿主已缓存场景。
