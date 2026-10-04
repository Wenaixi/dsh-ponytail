# dsh-ponytail 架构深化第三轮实施计划

> 执行方式：内联推进（executing-plans）。目标是修复真实语义漂移，不改变 DSH 外部契约。

**目标：** 消除 HTTP 优先级快照陈旧、接通唯一提示词出口；评估后不强行统一 provider、HTTP 与 build-client 的 SKILL.md frontmatter 读取语义。

**架构：** 保留 `resolvePriority()` 作为唯一优先级真源。HTTP 深 module 通过实时读取 adapter 消费 apply 的动态状态；提示词生产入口只调用 `renderPromptSection()`，技能禁用 reload 仍留在入口接线。frontmatter 共享 seam 暂不引入，因为三种消费者的边界与 fallback 语义不同，且 build-client 引入共享模块会增加构建耦合。

## 全局约束

- 四道门禁：`pnpm typecheck`、`pnpm build`、`node scripts/verify.mjs`、`node scripts/behavior.test.mjs`。
- 默认档优先级固定为环境变量 > cordis.patch.yml > config.json > full；唯一真源是 `resolvePriority()`。
- 保持零 Tool 注册、平台路径零字面量、UI 落点唯一 `plugins.bundle.config` 且 key 为包名。
- 保持 ADR-0003 的按需直读、无提示词缓存；保持 `settings.register("ponytail")`。
- 兼容读取 getLegacy* 不动；不新增依赖；不 push、不发版；每个小模块完成即 commit。

## Review Focus

- `/ponytail default` 写盘后，同一个 HTTP handler 的 GET 与 POST 必须读取新 patch 意图。
- 环境变量优先级必须仍在每次 HTTP 快照中生效。
- systemPrompt section 每次调用都必须重新同步 flag，并保留 disabledSkills reload；off/null 仍返回空串。
- provider 与 HTTP 的 frontmatter 差异必须被明确记录，不能无意改变既有 EOF、尾空白、缺字段和异常 fallback 语义。
- 若未来统一 parser，必须先确定三侧共同政策并覆盖边界矩阵测试。

## 任务 1：HTTP 优先级动态 adapter

- 修改 `src/ponytail-http.ts`：将静态 `patchMode`、`envRaw` 依赖改为 `readPatchMode()`、`readEnvRaw()` getter，每次 snapshot 调用。
- 修改 `src/ponytail.ts`：注入实时闭包 `() => patchMode` 与 `() => process.env["PONYTAIL_DEFAULT_MODE"]`。
- 修改 `scripts/behavior.test.mjs`：增加 apply 生产接线级回归，验证同一 handler 在 `/ponytail default ultra` 后 GET 与 POST 都显示 ultra。
- 运行四道门禁并提交 `fix(http): 读取动态默认档优先级`。

## 任务 2：接通唯一提示词出口

- 修改 `src/ponytail.ts`：保留 `state.reloadDisabledSkills()`，删除入口重复的 sync/off/render，改为 `return renderPromptSection(skillDir, state)`。
- 修改 `scripts/behavior.test.mjs`：增加 apply 到 systemPrompt section 的回归，外部 flag 变化后再次调用 section 必须读取新模式。
- 运行四道门禁并提交 `fix(prompt): 接通唯一提示词出口`。

## 任务 3：统一 frontmatter 内部读取语义

- 修改 `src/ponytail-skills.ts`：复用现有 parser 的 BOM、换行、结束标记与 YAML 处理，导出最小只读 frontmatter 读取 seam，不暴露 SkillProvider。
- 修改 `src/ponytail-http.ts`：删除近实现并消费共享 seam，HTTP 仍只提取 description。
- 修改 `scripts/behavior.test.mjs`：验证共享读取对 BOM、CRLF、合法结束标记、非法 YAML 的一致行为。
- 运行四道门禁并提交 `refactor(skills): 统一 frontmatter 读取语义`。

## 任务 4：最终验证与记忆同步

- 运行四道全量门禁，检查最终 diff、git status 和行为测试。
- 更新 `CLAUDE.md` 的模块职责、测试数量和本轮决策。
- 更新 `.superpowers/sdd/arch-deepen/progress.md`，提交本地文档，不 push。

## 执行结论

已完成任务 1、2 与任务 4。任务 3 经深度核实后按 YAGNI 延期：三侧 frontmatter 语义不同，当前不新增共享 seam。

验证：pnpm build、pnpm typecheck、node scripts/verify.mjs、node scripts/behavior.test.mjs 均通过，行为测试 64/64。