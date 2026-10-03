# dsh-ponytail 架构深挖六项实施计划

> **面向 Agent 执行者：** 必需子技能：executing-plans（用户已选择 plan 内联推进）。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 完成六项架构审查候选（C1~C6），消除 apply() 混合职责、技能元数据三处漂移、优先级判定三处并行、配置写盘重复与孤儿函数、客户端面板无 i18n；顺带修复 providerInstance 死变量与 patch 非法值注入垃圾态两个实锤 bug。

**架构：** 全部是对既有 8 深模块的收敛式重构：HTTP 端点剥为独立纯工厂、优先级判定统一到 resolvePriority、技能元数据以 SKILL.md frontmatter 为唯一真源、配置写盘合并为字段级 merge、客户端接入官方 ctx.locale。不新增依赖（yaml 已在 dependencies）、不新增 UI 落点（插件卡片面板是唯一落点，反向断言继续锁死）。

**技术栈：** TypeScript ES2022 / NodeNext / strict；Node 内置 runner（node:test + assert）；Schemastery；官方 @deepseek-ai/dsh-client-locale 0.2.0-rc.2（宿主提供，不进 peer）。

**规格：** 本计划基于 2026-10-04 六份子代理只读核实报告（C1~C6 各自结论、证据、风险、建议方案）与用户明确边界「6 个 SKILL.md 技能说明不翻译，其他 UI 双语」。执行者如需复核任一候选事实，可重读 src/ 与 scripts/ 对应行号。

## 全局约束

- 四道门禁每任务必跑：`pnpm typecheck`、`node scripts/behavior.test.mjs`（基线 44 项）、`node scripts/verify.mjs`（基线 33 断言）、`pnpm build`。
- 零 Tool 注册、零平台路径字面量、UI 落点唯一（plugins.bundle.config，key=包名）：verify.mjs 反向断言锁死，不得破坏。
- settings.register('ponytail', Config) 段必须留在 src/ponytail.ts（verify.mjs:116-122 单文件断言）。
- 兼容读取（getLegacyConfigDir/getLegacyConfigPath）本轮一律不动（5.x 整段删除），verify.mjs 豁免段与其绑定。
- 技能描述保持中文（frontmatter 原文），不翻译；用户边界明确。
- 每个任务完成即 commit（CLAUDE.md §6.7）；不 push、不发版。
- 行为变更声明：C4 使 review/大小写变体/带空白 env 的 patch 从「生效」变为「忽略」（归一修复），此变更须写入 CLAUDE.md 与 ADR。

## Review Focus

- **patch 显式值的大小写/非法变体**（'LITE'/'review'/'bogus'）：现状注入垃圾态（flag 文件写垃圾）；C4 后必须落合法档。锁定测试必须覆盖，且验证 flag 文件内容是合法值。
- **面板在线/离线两态**：build-client.mjs 的 EMPTY_CONFIG 是 fetch 失败 fallback；C2 后 server 与 fallback 必须同一真源（都来自 frontmatter），不允许一处新一处旧。
- **禁用技能在面板仍可见**（Switch 可重新打开）：C2 若改用 provider.list() 会因 isSkillEnabled 过滤丢行，必须保留全部 6 行 + enabled 标记。
- **locale 字典双语平衡**：register(ns, {zh,en}) 键必须完全成对；键对齐全、值可相同（skill 描述不翻译场景）。
- **未知配置字段保留**：C3 合并写盘后 config.json 中用户手写未知字段不得被丢弃（现状 writeFullConfig 会丢，修复后必须保留）。
- **诊断链 label/problem**：客户端按 source.level 覆盖展示，宿主端零改动；problem 按 level 查字典（env/patch=值无效，config=文件损坏）。

---

### 任务 1：C4 — 优先级判定统一为 resolvePriority 唯一真源（含 patch 归一 bug 修复）

**文件：**
- 修改：`src/ponytail.ts`（apply 内 initialMode 判定 + GET/POST 快照的 defaultMode）
- 测试：`scripts/behavior.test.mjs`（追加一致性锁定与边界用例）

**接口：**
- 消费：`resolvePriority({ envRaw?: string, patchMode?: string, configMode?: string }): { chain: PrioritySource[], effective: RuntimeMode }`（现有导出，src/ponytail-priority.ts）
- 产出：apply 内 `const effectiveInitial = resolvePriority({ envRaw, patchMode, configMode }).effective`；GET/POST 响应 `defaultMode: resolvePriority({...}).effective`（与 priority.effective 同源）
- 删除：`resolved.defaultMode` 的使用（保留 resolved 其余字段）；apply L93-100 三分支

- [ ] **步骤 1：先写失败测试**
  - 一致性锁定：构造 apply（mock ctx 同 behavior.test.mjs:112-125 现有模式），传 config.defaultMode='LITE'（大写）与 process.env.PONYTAIL_DEFAULT_MODE 为空，断言 state.get() 为 'lite' 且 flag 文件内容为 'lite'（当前行为：'LITE' 原样注入，测试会红）。
  - patch 非法：`resolvePriority({ patchMode: 'REVIEW' })` → effective 落 fallback 'full'（已有类似用例，补 config 缺失挡）。
  - env 空白：`resolvePriority({ envRaw: ' lite ' })` → effective 'lite'（当前 getDefaultMode 不 trim 会忽略）。

- [ ] **步骤 2：运行测试，确认新增用例红**
  运行：`node scripts/behavior.test.mjs`
  预期：新增 3 条 FAIL（其中一致性锁定那条以 flag 文件垃圾值形式失败）。

- [ ] **步骤 3：实现替换**
  - `src/ponytail.ts`：L84-100 判定整段替换为 `const initialMode = resolvePriority({ envRaw: process.env['PONYTAIL_DEFAULT_MODE'], patchMode: rawConfig['defaultMode'] as string | undefined, configMode: readRawConfigMode() }).effective`（保留 env warn 分支：`if (envRaw && !normalizeMode(envRaw)) ctx.logger.warn(...)`）。
  - GET/POST 快照（L297 与 L372）：`defaultMode: getDefaultMode()` 改为 `defaultMode: resolvePriority({...同参...}).effective`。

- [ ] **步骤 4：运行测试，确认全绿**
  运行：`node scripts/behavior.test.mjs`（预期 44+3 全绿）；`pnpm typecheck`；`node scripts/verify.mjs`；`pnpm build`。

- [ ] **步骤 5：提交**
  `git add -A && git commit -m "fix(priority): 优先级判定统一为 resolvePriority 唯一真源，修复 patch 未归一注入垃圾态"`

---

### 任务 2：C1 — HTTP 配置端点剥离为独立深工厂 + providerInstance 死变量修复

**文件：**
- 新建：`src/ponytail-http.ts`
- 修改：`src/ponytail.ts`（删 L263-399 整段，接线一行；修 providerInstance 赋值）
- 测试：`scripts/behavior.test.mjs`（追加端点用例）
- 修改：`scripts/verify.mjs`（checks 数组加 `lib/ponytail-http.js`）

**接口：**
- 消费：`PonytailState`（现有）、`resolvePriority`、`RuntimeMode`
- 产出：
  ```ts
  // src/ponytail-http.ts
  export interface ConfigHttpDeps {
    state: PonytailState
    getDefaultMode: () => RuntimeMode
    readRawConfigMode: () => string | undefined
    invalidateSkills: () => void
    patchMode: () => string | undefined
    logger: { info: (msg: string) => void }
    envRaw: string | undefined
  }
  export function createConfigHttpEndpoint(deps: ConfigHttpDeps):
    (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>
  ```
  - rawSkillsMeta 数组原样搬进工厂（Task 3 再改为 frontmatter 真源）
  - GET/POST 共用 `snapshot()` 函数去重（defaultMode 用 resolvePriority 同源，接 Task 1）
  - apply 接线：`if ((ctx as any).webServer) ctx.effect(() => (ctx as any).webServer.register({ kind: 'exact', path: '/api/plugins/ponytail/config', handler: createConfigHttpEndpoint({ state, getDefaultMode, readRawConfigMode, invalidateSkills, patchMode: () => rawConfig['defaultMode'] as string | undefined, logger: ctx.logger, envRaw: process.env['PONYTAIL_DEFAULT_MODE'] }) }), 'ponytail: web route')`
  - providerInstance 修复：`skills.registerProvider((control) => { providerInstance = new PonytailProvider(ctx, control, { providerName, skillDir }); return providerInstance })`

- [ ] **步骤 1：写失败测试（端点行为，当前 0 覆盖）**
  - GET：fake req `{ method: 'GET' }`，fake res 收集 status/body → 200 且 `priority.chain.length === 4`
  - POST mode：`{ method: 'POST', [Symbol.asyncIterator]: async function* () { yield '{"mode":"lite"}' } }` → 状态码 200、`state.get() === 'lite'`
  - POST 非法 JSON → 400
  - PATCH → 405；`{ action: 'reset' }` → invalidateSkills 计数 +1
  工厂经 `createConfigHttpEndpoint` 直接测（不经 apply），state 用内存 storage 适配器。

- [ ] **步骤 2：运行测试，确认红**（`createConfigHttpEndpoint is not defined`）
- [ ] **步骤 3：实现新建 src/ponytail-http.ts + apply 接线 + providerInstance 修复 + verify checks 追加**
- [ ] **步骤 4：全门禁**：`node scripts/behavior.test.mjs`、`pnpm typecheck`、`node scripts/verify.mjs`、`pnpm build`
- [ ] **步骤 5：提交** `fix(http): 配置端点剥离为独立深工厂，修复 providerInstance 死变量使 invalidateSkills 生效`

---

### 任务 3：C2 — 技能元数据单一真源（SKILL.md frontmatter）

**文件：**
- 修改：`src/ponytail-http.ts`（删 rawSkillsMeta，改读 frontmatter）
- 修改：`scripts/build-client.mjs`（SKILL_META 改为构建期提取 frontmatter；rowDesc 单行省略）
- 修改：`scripts/verify.mjs`（反向断言：src/ 与 build-client.mjs 不再出现硬编码技能描述）
- 测试：`scripts/behavior.test.mjs`

**接口：**
- 产出：工厂内 `readSkillMeta(skillDir: string): { id: string; name: string; description: string }[]`（readdirSync+readFileSync SKILL.md+yaml.parse，**不经 provider 过滤**，禁用技能仍全量返回；enabled 由 state.isSkillEnabled 标记）
- deps 增加 `skillDir: string`
- 面板在线显示 server 返回的完整 frontmatter description（中文，≤500）；EMPTY_CONFIG fallback 由 build-client.mjs 构建期提取同一 frontmatter

- [ ] **步骤 1：写失败测试**
  - `readSkillMeta` 返回 6 项（含禁用技能也在）
  - GET 响应 skills 中 ponytail 的 description 包含「触发词」（frontmatter 原文特征）
- [ ] **步骤 2：运行测试，确认红**
- [ ] **步骤 3：实现**
  - src/ponytail-http.ts：`readSkillMeta` 函数 + deps.skillDir
  - build-client.mjs：`import { readdirSync, readFileSync } from 'node:fs'`；构建时读 skills/*/SKILL.md 提取 frontmatter 生成 SKILL_META（fail-fast：缺文件即抛）
  - rowDesc 样式加 `textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden'`
  - verify.mjs：断言 `!buildClientSrc.includes('SKILL_META =')` 与 `!srcHttp.includes('description:')`（硬编码形式）
- [ ] **步骤 4：全门禁**
- [ ] **步骤 5：提交** `refactor(meta): 技能元数据以 SKILL.md frontmatter 为唯一真源，移除三处硬编码`

---

### 任务 4：C3 — 配置写盘收敛与孤儿函数清理

**文件：**
- 修改：`src/ponytail-config.ts`（删孤儿 isDeactivationCommand 与 normalizeConfigMode；合并 writeFullConfig/writeDefaultMode 为字段级 merge；统一失败语义注释）
- 测试：`scripts/behavior.test.mjs`（补未知字段保留断言）

**接口：**
- 产出：内部 `writeConfig(patch: { defaultMode?: string; disabledSkills?: string[] }): FullConfigData | null` ——读 raw JSON（readConfigFileText）→ 字段级 merge（defaultMode 经 normalizeMode 校验，非法拒绝返回 null 不写盘；disabledSkills 过滤 string）→ 保留未知字段 → 写回
- `writeFullConfig`、`writeDefaultMode` 变为薄包装（导出名与签名不变，commands/state/apply/测试 import 面零改动）
- 删除导出：`isDeactivationCommand`（config 版）、`normalizeConfigMode`（双孤儿，全仓零调用方）

- [ ] **步骤 1：写失败测试**
  - config.json 预写 `{ "defaultMode": "lite", "unknownKey": "keep-me" }`，`writeFullConfig({ defaultMode: 'ultra' })` 后文件仍含 `unknownKey`（当前 writeFullConfig 丢弃未知字段，红）
  - `writeDefaultMode('bogus')` 返回 null 且文件不变
- [ ] **步骤 2：运行测试，确认红**
- [ ] **步骤 3：实现合并 + 删双孤儿**（同步保持其余 6 个导出语义不变）
- [ ] **步骤 4：全门禁**
- [ ] **步骤 5：提交** `refactor(config): 配置写盘统一字段级 merge 保留未知字段，删除双孤儿函数`

---

### 任务 5：C6 — 客户端面板接入官方 ctx.locale 双语（UI 文案，技能描述除外）

**文件：**
- 修改：`package.json`（dsh.client.inject 加 `"@deepseek-ai/dsh-client-locale"`）
- 修改：`scripts/build-client.mjs`（字典 + bind + t() 全面替换硬编码中文）
- 修改：`scripts/verify.mjs`（locale 接入反向断言）
- 测试：构建产物静态断言（verify 内）

**接口：**
- 消费：`ctx.locale.register('ponytail', { zh, en })`、`ctx.locale.bind('ponytail')`，`exports.inject = ['slots', 'locale']`
- 产出：字典 key 全集（zh/en 键完全成对，值可相同）：
  `panel.title / priority.title / priority.hint({effective}) / priority.unavailable / chain.status.hit / chain.status.shadowed / chain.status.unset / problem.env / problem.patch / problem.config / mode.title / mode.hint / mode.locked / mode.off / mode.lite / mode.full / mode.ultra / skills.title / skills.hint / skill.enabled.on({name}) / skill.enabled.off({name}) / reset.button / reset.confirm / footer.saved / footer.loading / footer.error({error}) / toast.mode({mode}) / toast.skill.on({name}) / toast.skill.off({name}) / toast.reset / label.env / label.patch / label.config / label.fallback`
- 组件内 `t` 用 factory 级变量（`let t = (k) => k`，apply 里赋值），组件不接收 ctx（铁律）
- 诊断链 label/problem：客户端按 `source.level` 查字典覆盖（host 中文不动）
- 技能描述：直接显示 server/frontmatter 中文（Task 3 后），不进字典——用户边界自然满足

- [ ] **步骤 1：verify.mjs 先加失败断言**：`buildClientSrc.includes('ctx.locale.register("ponytail"')` 与 `exports.inject` 含 locale、`!buildClientSrc.includes('className: "关闭"')` 之类硬编码中文抽样——当前红
- [ ] **步骤 2：实现**：package.json inject、factory 内字典对象、apply 注册 + bind、全部文案换 t()、诊断链覆盖、footer/toast/confirm 全部走 t
- [ ] **步骤 3：验证**：`node scripts/verify.mjs` 绿；`pnpm build` 后读 `lib/client.js` 确认无游离中文文案（grep 检查）
- [ ] **步骤 4：全门禁**
- [ ] **步骤 5：提交** `feat(i18n): 客户端面板接入官方 ctx.locale 双语，技能描述保持中文`

---

### 任务 6：收尾 — 文档、债务表、ADR 与全量验证

**文件：**
- 修改：`CLAUDE.md`（§7 债务表更新：isDeactivationCommand 已删、priority 已入产物清单、providerInstance 已修、C5 并入说明、C4 行为变更声明、ConfigStore 未做裁决记录）
- 修改：`CONTEXT.md`（若需，补「Skill Meta Single Source」等术语；诊断链 label 客户端覆盖说明）
- 新建：`docs/adr/0006-priority-and-config-convergence.md`（记录优先级唯一真源 + patch 归一修复 + 配置写盘 merge + 客户端官方 locale 接入）
- 检查：`scripts/verify.mjs` 产物清单已含 ponytail-http.js 与 ponytail-priority.js（债务修复）

- [ ] **步骤 1：更新三份文档**
- [ ] **步骤 2：四道门禁全量跑**：`pnpm build && pnpm typecheck && node scripts/verify.mjs && node scripts/behavior.test.mjs` 全绿
- [ ] **步骤 3：最终评审**：派一个全新上下文 review 子代理（requesting-code-review 模式），按任务 1~5 的 commit 区间评审，Critical/Important 立即修
- [ ] **步骤 4：提交** `docs: 架构收敛记录与债务表更新（ADR-0006）`
