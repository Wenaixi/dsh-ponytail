# dsh-ponytail 架构深挖第二轮实施计划（2026-10-04）

> 依据 improve-codebase-architecture 第二轮报告（6 候选）+ 7 个核实子代理的只读证据 + Lead 亲自探针复现。
> 用户指令：派子代理深度核实每一个 → 自我最佳决策 → 使用 superpower 全技能 → plan 内联推进 → 不问、不停。
> 本轮为收敛式重构：不新增依赖、不新增 UI 落点、零 Tool 注册铁律不变。

## 全局约束（沿用第一轮）
- 四道门禁每任务必跑：`pnpm typecheck` / `node scripts/behavior.test.mjs` / `node scripts/verify.mjs` / `pnpm build`。
- 不可破坏：零 Tool 注册、平台路径零字面量、UI 落点唯一（plugins.bundle.config，key=包名）、settings.register('ponytail')。
- 兼容读取（getLegacy*）不动（5.x 单独清理）。
- 每任务完成即 commit；不 push、不发版。

## 候选裁决（来自核实 + 复现证据）
| 候选 | 裁决 | 证据 |
|---|---|---|
| C4 客户端产物 import.meta 死代码 | **成立（Strong，4.10.0-dsh.10 回归）** | 2bdd26d 经 git log -S 实锤引入；宿主 dsh-client-modules 原样拼接 bundle（buildComboScript/prepareSource 只剥 sourcemap 注释，无 transform）；`<script src>` 上下文 import.meta = SyntaxError；Node 探针复现 |
| C7 默认档命令层分裂 | **成立（真 bug，实锤复现）** | 探针：patch='lite'+config 缺失 → 路径 A effective='lite'、路径 B getDefaultMode()='full'；`/ponytail foobar` 后 state.get()='full'（应从 lite 保持）；裸 /ponytail 报告 full。dispatcher 未注入 getDefaultMode（ponytail.ts:191-195） |
| C2 config 读侧 4 处解析 | **成立（语义差异已逐条比对）** | readConfigFileText 返回原文；getDefaultMode 无 patch 层/无 trim；readFullConfig 归一兜底；writeFullConfig 需保留未知键。收敛为私有 parseConfigObject 不改各导出语义 |
| C3 HTTP 快照双求值 | **部分成立（无故障面，随 C2 一并落地）** | snapshot() 内 resolvePriority×2 + readRawConfigMode×2（L38/41/53/56）；进程内必一致；合并后 defaultMode===priority.effective 结构保证 |
| C1 状态模块混居 | **部分成立（方案 B：补方法不拆模块）** | 技能簇无反向同步（构造时只读一次 L67）；「禁用主技能→关停」共 2 处可执行规则（http L165/L177）+ 1 处注释；ADR/CONTEXT 无契约阻止 |
| C6 runtime 薄壳 | **成立（内联全胜）** | 唯一调用方 defaultDiskStorage（state L57-61）；测试仅 3 处直接 import；verify.mjs:70 清单一行；净减 1 文件 + ~30 行 |
| C5 SkillProvider 缓存 | **否决** | 宿主 dsh-skill 已有 collectCache（revision/invalidateCache/collectCacheKey），list() 命中缓存**不调用 provider**；provider 内缓存边际收益≈0；官方文档该建议不适用于已被宿主缓存覆盖的场景 |

## 任务列表（含 TDD 红→绿）
### T1 C4：修客户端产物 import.meta 死代码回归
- 改 scripts/build-client.mjs：删模板内死行 `const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')`。
- 改 scripts/verify.mjs：新增反向断言 —— lib/client.js 不得含 `import.meta` 与 `process.`（Node API 残留）；先破坏实测（人为在模板加回该行 → verify 红）再还原。
- 验证：pnpm build 后 grep lib/client.js 无 import.meta；Node 探针（new Function 模拟 factory）加载通过。
- commit：fix(client): 删除产物内嵌宿侧死代码 import.meta，verify 补 Node API 残留反向断言

### T2 C7：修默认档命令层分裂（真 bug）
- 先加失败测试：behavior.test.mjs 新增「apply patch='lite' + config 缺失 → /ponytail foobar 后 state.get()==='lite'」集成用例（当前红：切成 'full'）。
- 改 src/ponytail.ts：createCommandDispatcher 注入 `getDefaultMode: () => resolvePriority({envRaw, patchMode, configMode: readRawConfigMode()}).effective`（实时闭包，不 snapshot）。
- 验证：新测试绿；既有 59 项不回归；ADR-0006「命令模块 fallback 语义不变」需修订。
- commit：fix(commands): 默认档判定统一走 resolvePriority，修 patch 层下命令切档分裂

### T3 C2+C3：config 读侧收敛 + HTTP 快照合并
- src/ponytail-config.ts：新增私有 `parseConfigObject(raw: string | null)` 归一解析（defaultMode 归一+兜底、disabledSkills 过滤字符串）；readFullConfig 复用；getDefaultMode 复用其 config 分支（保留无 patch 层/无 trim 的既有语义——R3 不动）；writeFullConfig 读段保持原始对象（未知键），仅 defaultMode/disabledSkills 归一逻辑复用 parseConfigObject 的字段规则。
- src/ponytail-http.ts snapshot()：读一次 configMode → resolvePriority 一次 → defaultMode=report.effective。
- verify.mjs：新增断言「build 产物与 src 均不含重复 resolvePriority 双调」不可行（静态难查），改为 behavior 测试断言 `defaultMode === priority.effective`。
- 加 1 条行为测试：GET 快照 `assert.equal(res.json.defaultMode, res.json.priority.effective)`。
- commit：refactor(config): 读侧收敛单一解析出口 + HTTP 快照单求值

### T4 C1：状态模块补 reload 收敛与禁用主技能纯函数
- src/ponytail-state.ts：PonytailState 接口 + 实现新增 `reloadDisabledSkills()`（`disabledSkills = new Set(readFullConfig().disabledSkills)`）；导出 `isMainSkillDisabled(disabled)` 纯函数。
- src/ponytail.ts：section 注入前 `state.syncFromFile(); state.reloadDisabledSkills()`（与等级同构收敛）。
- src/ponytail-http.ts：POST 两分支改共用 isMainSkillDisabled（L165/L177）。
- 加 1 条行为测试：外部改 config.json disabledSkills 后 reloadDisabledSkills 收敛 + isMainSkillDisabled 真值表。
- commit：refactor(state): 技能禁用补文件优先收敛，禁用主技能规则提为单一纯函数

### T5 C6：runtime 内联进 state
- 删 src/ponytail-runtime.ts；src/ponytail-state.ts 头部加 fs import + STATE_FILE 常量 + setMode/clearMode/readMode 内联（~15 行）；模块头注释更新。
- scripts/behavior.test.mjs：import 改从 ponytail-state.js 引；scripts/verify.mjs checks 删 'lib/ponytail-runtime.js'。
- CONTEXT.md §2 表格行改「职责并入 ponytail-state」；README.md 对照表同步。
- 验证：`pnpm build` 后 lib/ponytail-runtime.* 消失；行为 59+1 全绿。
- commit：refactor(runtime): flag 物理存取并入 state 模块，删除薄壳 runtime

### T6 文档与收尾
- 新建 docs/adr/0007-config-read-convergence-and-default-mode-unification.md：记录 C7 修复（命令层并入 resolvePriority 真源，修订 ADR-0006 决策 1）、C2 读侧收敛、C6 runtime 内联、C5 否决理由（宿主 collectCache 已覆盖）。
- 更新 CONTEXT.md / LEDGER.md / CHANGELOG.md / CLAUDE.md / README.md（对照表、债务表、描述数字）。
- 四道门禁全量绿；最终 review 子代理评审 commit 区间；逐任务 commit。
