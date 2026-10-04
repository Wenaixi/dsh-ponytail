# 7. 默认档命令层统一真源，读侧收敛与 flag 内联

- **状态 (Status)**: 已采纳 (Accepted)
- **日期 (Date)**: 2026-10-04
- **决策者 (Deciders)**: Ponytail 架构小组
- **修订对象**: [ADR-0006](0006-priority-config-convergence.md) 决策 1

## 背景与上下文 (Context)

第二轮架构深挖（improve-codebase-architecture）派出 7 个只读核实子代理 + Lead 亲自探针复现，确认三项事实：

1. **默认档命令层分裂（真 bug）**：apply 的 initialMode 与 UI 面板 defaultMode 走
   `resolvePriority()`（含 patch 层），而 `createCommandDispatcher` 未注入
   `getDefaultMode` 时落到 `getDefaultMode()`（无 patch 层）。当 cordis.patch.yml
   显式声明 `defaultMode`（如 lite）且 config.json 缺失/不同时，探针实测
   `/ponytail foobar`（上游 else 兜底切默认档）把等级从 lite 切到 full，
   裸 `/ponytail` 报告档也错误——界面与命令层静默不一致。
2. **config.json 读侧四分**：读文件→JSON.parse→取字段→归一/兜底逻辑分散在
   readFullConfig / getDefaultMode / apply 闭包 readRawConfigMode / writeFullConfig
   merge 读段 4 处；HTTP 快照内 `resolvePriority` 双调 + 双读盘（最坏 4 次 readFileSync）。
3. **flag 物理存取薄壳**：`src/ponytail-runtime.ts` 46 行（`resolveStateDir` 只是
   `getConfigDir` 的无谓转发），唯一调用方是 state 的 defaultDiskStorage；59 项测试
   仅 3 处直接 import，独立测试面价值≈0。

另有核实结论：宿主 dsh-skill 0.2.0-rc.2 自带 collectCache（revision + invalidateCache +
collectCacheKey），list() 命中缓存不调用 provider，**provider 内再做 list 缓存边际收益≈0**，
故「SkillProvider 进程内快照」候选被否决。

## 架构决断 (Decision)

1. **命令层默认档并入 resolvePriority 真源（修订 ADR-0006 决策 1）**：
   apply 构造 dispatcher 时注入实时闭包
   `getDefaultMode: () => resolvePriority({envRaw, patchMode, configMode: readRawConfigMode()}).effective`。
   必须实时而非快照：`/ponytail default <档>` 写盘后下一次命令解析要读到新值。
   三条消费路径（apply 启动 / UI 面板 / 命令兜底切档）从此同源同刻。
2. **读侧收敛单一解析出口**：新增私有 `parseConfigObject(raw)` 归一解析唯一真源，
   readFullConfig 退化为薄包装；getDefaultMode 语义（无 patch 层、无 trim）与
   writeFullConfig（保留未知键）不动。HTTP 快照合并为单求值
   （读一次 configMode → resolvePriority 一次 → defaultMode = report.effective），
   `defaultMode === priority.effective` 由结构保证并以行为测试锁定。
3. **flag 物理存取并入 state**：删除 src/ponytail-runtime.ts，
   STATE_FILE/setMode/clearMode/readMode 内联进 ponytail-state.ts（保持导出），
   净减 1 文件 + 一层间接委托。
4. **技能禁用补文件优先收敛**：PonytailState 新增 `reloadDisabledSkills()`
   （与等级侧 syncFromFile 同构）；「禁用 ponytail → 关闭等级」规则提为
   `isMainSkillDisabled()` 纯函数，HTTP POST 两分支共用同一守卫。

## 影响与后果 (Consequences)

- **正面收益**：默认档语义单点可见且可测（60→61 项行为测试全绿）；读侧字段规则只在一处
  演化；HTTP 快照读盘减半；flag 物理位置知识收敛进 state；客户端产物删除宿侧死代码
  import.meta 回归（verify 新增 Node API 残留反向断言）。
- **妥协权衡**：命令层 fallback 语义从「独立于 patch」变为「并入 patch 层」——这是修复
  而非回归（分裂本身就是 bug）；runtime 与上游同名文件的 1:1 对照点消失（内容早已脱钩，
  ADR-0004/0005 已删平台探针）。
- **兼容性**：Config schema、cordis.patch.yml、UI 落点、settings.register 均未变；
  getLegacy* 兼容读取未动。

## 验证证据 (Verification)

- `node scripts/behavior.test.mjs`：60 → 61 项全绿（新增 C7 命令层回归 + C1 reload 收敛 + C3 不变量）。
- `node scripts/verify.mjs`：36 → 37 条断言 ALL PASS（新增 lib/client.js Node API 残留反向断言，先破坏实测再还原）。
- `pnpm typecheck` / `pnpm build` 通过；lib/ponytail-runtime.* 已从产物消失。
