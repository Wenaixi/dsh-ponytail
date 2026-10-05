# dsh-ponytail 迁移到 DSH 官方插件配置组合（方案 B）

> 执行方式：内联推进（executing-plans）。方案 B = 官方 Settings/configForms 承载可持久化字段 + 官方 Typert 通道承载只读推导值，彻底删除自制 HTTP。

**目标：** 插件详情页的配置卡不再 `fetch('/api/plugins/ponytail/config')`。可持久化字段（`defaultMode`、`disabledSkills`）经 `Config.volatile()` + 客户端 `configForms` 写入 profile patch；只读推导值（优先级诊断链、当前生效等级）经 Host 侧 `TypertRemoteService` 命名空间 `ponytail` 下发。删除 `src/ponytail-http.ts` 与 `webServer` 注入。

**架构：** 数据按性质劈成两半。持久化配置走 Cordis Config（volatile 字段，落 `profiles/<name>/cordis.patch.yml`，带 revision 冲突保护与 `loader/volatile-update` 热提交）；运行时推导值走 typert 通道（网关按 `typertRemote` 绑定自动发现，浏览器 `ctx.remote.ponytail.snapshot()`）。UI 落点仍是唯一 `plugins.bundle.config`，key 仍为包名。

## 全局约束

- 四道门禁：`pnpm typecheck`、`pnpm build`、`node scripts/verify.mjs`、`node scripts/behavior.test.mjs`。
- 唯一优先级真源仍是 `resolvePriority()`；四层不变：env > profile patch > config.json > full。
- 零 Tool 注册、平台路径零字面量、UI 落点唯一。
- 不新增 HTTP 路由；不 push、不发版；每个任务完成即 commit。
- 技能元数据真源仍是 `SKILL.md` frontmatter（`readSkillMeta`），只是搬家。

## 前置事实（已核验源码，勿再假设）

| 事实 | 证据 |
|---|---|
| `@deepseek-ai/dsh-settings@0.2.0-rc.2` **没有 `register` 方法** | `lib/index.js` 545 行，`register(` 出现 0 次；公开成员仅 `describe/update/replace/mutate/write/configure/invalidate/prepareDocument/writable/documentPath/importLegacyDocument` |
| 命名空间**不需要注册**，由「唯一 profile 条目 + 含 volatile 字段的 Config」自动产生 | `dsh-settings/lib/index.js:413-464`：`configEditor.configuration()` → `schema(entry)` → `volatileForm(schema)`，undefined 则跳过 |
| 命名空间 id = profile 条目 id（`cordis.patch.yml` 的 `id`），且要求全 profile 内唯一 | `dsh-config-editor/lib/index.js:30-35`（去重过滤）、`dsh-settings/lib/index.js:442` `ns: entry.options.id` |
| volatile 写入经 `configEditor.edit()` 落进 profile patch YAML | `dsh-settings/lib/index.js:501-537` + `dsh-config-editor/lib/index.js:98-110`；`dsh-base/cordis.patch.yml` 注释「Live Config forms persist through the active profile patch」 |
| volatile 的含义是「改了不重挂载」不是「不落盘」 | `cordis-plugin-loader/lib/index.js:380-382, 393-425`：`_commitVolatile` 就地提交并 `emit('loader/volatile-update', paths)` |
| volatile 必须落在固定对象路径（不能在 union 分支/数组元素/dict 内） | `schemastery/lib/index.mjs:241-252` |
| 非 volatile 字段写入抛 `Config field "x" is not volatile`；无 volatile 字段抛 `has no volatile fields` | `dsh-settings/lib/index.js:505-520` |
| 官方接线范式：`configForms.get(ns)` + `whileServed([ns], ...)` + `slots.inject` | `dsh-client-ui-settings-shell/lib/client.js:176-189` |
| 卡片组件的 `t` 由 `locale: NS` 声明后由渲染器注入 | `dsh-client-ui-renderer/lib/client.js:721-725` |
| 客户端表单控制器表面：`getSnapshot/subscribe/set/unset/mutate/dispose` | `dsh-client-ui-settings/lib/client.js:1090-1256` |
| 非 loopback 客户端 persistence=memory，写入直接返回 false | `dsh-client-ui-settings/lib/client.js:1212-1220, 1509` |
| 网关按 `typertRemote` 绑定自动发现任意 Remote 命名空间 | `dsh-api-gateway/lib/index.js:706-719`（`collectSrcClaims`）、`:1004-1022`（`resolveSrcDescriptor`） |
| 客户端把命名空间挂成 `ctx.remote.<namespace>` | `dsh-api-gateway/lib/client.js:2040-2041` `remoteServiceKey` |
| 写操作被上层 home patch / 命令行覆盖时整条抛错 | `dsh-config-editor/lib/index.js:122` |

## Review Focus

- `settings` 服务不存在（headless / 无 profileContext 组合）时，插件必须仍能读写 `config.json`，不能因为迁移而在这些组合里静默失效。
- 官方写入落 profile patch 后，`/ponytail default <档>` 的同步语义不能回退：patch 层命中时 `/ponytail foobar` 不得偏离 `resolvePriority().effective`（ADR-0007 回归点）。
- `disabledSkills` 改动后，模型侧技能目录必须即时收敛（`loader/volatile-update` → `providerInstance.invalidate()`）；人为去掉监听，测试必须红。
- 一键重置改用 unset 后，等级必须回落到 fallback 'full'，不得出现「重置后等级为空」。
- 客户端卡片 DOM 节点数必须恰好为 1（唯一落点）。
- `currentMode`（会话内 `/ponytail lite`）不会 bump config revision，卡片显示会滞后——这是与旧 HTTP 面板的**行为平价**，不得为此引入轮询。

## 任务 1：探针（schema 形状 + 表单投影 + 写入门槛）

- 新建 `.superpowers/sdd/official-plugin-config-migration/probe.mjs`（不入库）。
- 探针 A：用仓库内 `@deepseek-ai/schemastery` 声明 `defaultMode: Schema.union(['off','lite','full','ultra']).volatile()` 与 `disabledSkills: Schema.array(Schema.string()).volatile()`，调用 `resolve()` 验证不抛「volatile fields require a fixed object path」，且解析出的值是带 `.get()` 的引用。
- 探针 B：直接 import 桌面版解包的 `@deepseek-ai/dsh-settings/lib/types/schema.js`，对本仓 `Config` 调 `volatileForm()`，断言非 undefined 且含两个键。
- 探针 C：同一模块的 `isVolatilePath(Config, ['defaultMode'])` 与 `isVolatilePath(Config, ['disabledSkills'])` 均为 true；`isVolatilePath(Config, ['providerName'])` 为 false。
- 探针 D：`tsc` 编译一个含 `@Remote()` 装饰器方法并 `extends TypertRemoteService` 的最小类，断言产出 `__esDecorate` 且无 TS 报错（装饰器可行性）。
- 每条探针的输出写进 ledger；A/B/C 任一失败则整个迁移方案作废，改走方案 A。
- 提交：探针文件在 gitignore 的 `.superpowers/` 下，**不提交**，只提交一条 `docs: 记录官方配置组合迁移的前置事实`。

## 任务 2：Config 迁移与优先级真源改造

- `src/ponytail.ts`：`Config` 增加 `defaultMode` 与 `disabledSkills` 两个 `.volatile()` 字段；`defaultMode` **仍不给 `Schema.default()`**。
- 新增 `src/ponytail-settings.ts`：
  - `PonytailConfigSink` 接口（`readDefaultMode/writeDefaultMode/readDisabled/writeDisabled/reset`）。
  - `createSettingsSink(ctx)`：读写经 `ctx.settings.mutate(ns, ops, revision)`；无 settings 服务时抛错。
  - `createFileSink()`：委托既有 `ponytail-config.ts` 的 `readFullConfig/writeFullConfig/resetFullConfig`，作为无 settings 组合的回退。
  - `migrateLegacyConfig(ctx)`：读到 `config.json` 有内容且 profile patch 未设时 `settings.update()` 一次，随后把 `config.json` 改名 `.imported`（对齐 `dsh-settings/lib/index.js:346-363` 的官方做法）；失败只记 warn。
- `src/ponytail-state.ts`：`createPonytailState` 改为接收 sink，删除 `setDefaultMode` 与 `resetToDefaults`（HTTP 专属，Task 6 后无调用方）。
- `src/ponytail.ts`：`patchMode` 从启动快照改为实时读取 volatile 引用（含 `patchOverride` 乐观缓存，收到 `loader/volatile-update` 的 `defaultMode` 后清除）。
- `scripts/behavior.test.mjs`：新增——Config 形状、sink 双实现、legacy 迁移幂等、volatile patch 层被 resolvePriority 读取。
- 提交 `feat(config): 默认档与禁用技能迁入 volatile Config`。

## 任务 3：`loader/volatile-update` 接线

- `src/ponytail.ts`：监听 `loader/volatile-update`，路径含 `disabledSkills` 时 `providerInstance?.invalidate()` 并 `state.reloadDisabledSkills()`；路径含 `defaultMode` 时清 `patchOverride`。
- `scripts/behavior.test.mjs`：新增回归——收到 `disabledSkills` 事件后 invalidate 被调用一次；人为去掉监听后该测试必须红。
- 提交 `fix(skills): 用 loader/volatile-update 收敛技能目录失效`。

## 任务 4：命令层默认档走 Settings

- `src/ponytail.ts`：dispatcher 的 `writeDefaultMode` 改为 `(m) => sink.writeDefaultMode(m)`；删除 `updateDefaultMode` 回调与 `patchMode` 变量（改由实时 getter 提供）。
- `scripts/behavior.test.mjs`：C7 两条实时性测试改为经 sink 断言（现有 C7 测试已覆盖 `updateDefaultMode`，需同步调整）。
- 提交 `fix(commands): 默认档写入经配置通道`。

## 任务 5：Host 侧 Typert 通道

- 新增 `src/ponytail-remote.ts`：`PonytailRemoteSnapshot` 类型 + `createPonytailRemoteService(deps)` 返回 `TypertRemoteService` 子类，暴露 `@Remote() snapshot()`（返回 `{ currentMode, priority }`）。
- 从 `ponytail-http.ts` 搬 `readSkillMeta`、`parseSkillFrontmatter`、`FALLBACK_SKILL_META` 到 `ponytail-remote.ts`（HTTP 文件 Task 7 删）。
- `src/ponytail.ts`：`ctx.plugin(PonytailRemote)`；`snapshot()` 只返回 `currentMode` 与 `priority`。
- `package.json`：加 `peerDependencies["@deepseek-ai/dsh-typert-protocol"]`。
- `scripts/behavior.test.mjs`：`snapshot()` 返回 4 项诊断链、`currentMode` 与 state 一致、非法档标注 problem。
- 提交 `feat(remote): 用 Typert 通道下发只读推导值`。

## 任务 6：客户端卡片改走 configForms

- `scripts/build-client.mjs`：
  - 删除 `fetch`-based 的 load/post 与 `EMPTY_CONFIG` 兜底；`inject` 改为 `["slots", "locale", "configForms", "remote"]`。
  - `apply`：`var scope = ctx.configForms.get("ponytail")`；`slots.inject("plugins.bundle.config", ...)` 保持 key 为包名、`locale: NS`；注册体由 `ctx.configForms.whileServed(["ponytail"], ...)` 包裹。
  - 组件从 `scope.getSnapshot()` 读 `value.defaultMode` / `value.disabledSkills`（技能开关直接用这两个字段，不再要服务端逐项 enabled）；优先级链与当前等级来自 `ctx.remote.ponytail.snapshot()`，在 scope revision 变化时重取。
  - 写入一律走 `scope.mutate([{op:'set',path,value}], snapshot.revision)`；一键重置走两条 `op:'unset'`。
  - 远程命名空间缺失时降级为「不显示优先级段」并 warn，不影响其余控件。
- `package.json`：`dsh.client.inject` 增 `@deepseek-ai/dsh-client-ui-settings`（若已存在则不动）。
- `locale/zh.json`、`locale/en.json`：新增键必须两册齐平；删除已无引用键。
- `scripts/verify.mjs`：客户端门禁改为断言 `configForms.get("ponytail")` 与 `whileServed(["ponytail"]`；断言产物中**不含** `/api/plugins/ponytail` 字面量。
- 提交 `feat(client): 配置卡改用官方 configForms 与 remote 通道`。

## 任务 7：删除 HTTP 与门禁重写

- 删除 `src/ponytail-http.ts`；`src/ponytail.ts` 的 `inject` 去掉 `webServer`，删除 `createConfigHttpEndpoint` 接线。
- `scripts/verify.mjs`：删除 `settings.register('ponytail'` 断言（该 API 不存在），改为断言 `Config` 含 volatile 字段、`cordis.patch.yml` 有 `id: ponytail`、`readSkillMeta` 位于新模块。
- `scripts/behavior.test.mjs`：删除约 10 项 HTTP 端点测试（GET/POST/405/reset/frontmatter/回退），补等价 Remote 行为测试。
- `README.md`、`CHANGELOG.md`、`AGENTS.md`：同步「配置落 profile patch」与新通道说明。
- 四道门禁全绿后提交 `refactor(http): 删除自制 HTTP 端点`。

## 任务 8：隔离实例验收

- 新建隔离 profile（`dsh <name> --from-default-profile web`），只装 base + web-app + 本地 ponytail。
- 冷启动后核对：`cordis.patch.yml` 出现 `- id: ponytail` 行；浏览器 Plugins 页 ponytail 详情页出现配置卡且 DOM 计数为 1。
- 浏览器点选：切等级 → 读 `cordis.patch.yml` 确认落盘；关一个技能 → 确认技能目录即时收敛；一键重置 → 确认两字段被 unset 且等级回 `full`。
- 核对 `ctx.remote.ponytail.snapshot()` 返回 4 项诊断链。
- 重启宿主确认配置仍在（volatile 落盘而非仅内存）。
- 模型由用户选定；验收记录写 `docs/superpowers/plans/` 并提交，不 push。
- 提交 `docs: 记录隔离实例验收结果`。

## 执行结论

（执行后填写）
