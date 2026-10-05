# 0009 配置与 flag 下沉到 profile 维度，优先级链砍掉 config 层

- 状态：已采纳
- 日期：2026-10-05
- 修订对象：[ADR-0005](0005-config-under-dsh-home.md)、[ADR-0006](0006-priority-config-convergence.md)、[ADR-0007](0007-config-read-convergence-and-default-mode-unification.md)

## 背景

ADR-0004 假定「单一宿主」，ADR-0005 因此把配置与 flag 放进 `$DSH_HOME/ponytail`。这个前提不成立：`resolveDshHome()` 结构上只解析 `$DSH_HOME` 或 `~/.dsh`，不含 profile 维度，因此该目录下的文件被所有实例共享。

实测（同机 2026-10-05）：`~/.dsh/profiles/` 下存在 28 个 profile，多个实例同时运行。共享带来三个具体故障：

1. **flag 互相覆盖**。`renderPromptSection` 的 `syncFromFile()` 是文件优先，`agent/created` 的 `syncToFile()` 是内存优先。最后启动会话的实例决定全局档位，另一个实例的设置被静默顶掉。
2. **语义分叉**。已发布版本配置全局共享，HEAD（volatile Config 迁入官方 settings 通道）单实例独立。同机并存时同一插件有两套语义。
3. **诊断面板说谎**。优先级链里的 config 层指向共享文件，改它会影响别的实例，而面板把它显示成一个可安全编辑的普通层级。

## 决策

### 1. 作用域下沉到 profile

`getConfigDir(profileDir?)` 等全部配置文件读写函数与 flag 存取（`createDiskStorage(profileDir)`）接受 profile 目录，目录来自宿主 `profileContext.dir`（`dsh/lib/profile-boot` 的 `runProfile` 在整棵插件树挂载前 provide）。落点改为 `profiles/<name>/ponytail/`。

缺省分支（无 profile 目录）退回 `$DSH_HOME/ponytail`，只服务 mock 宿主与裁剪宿主。真实 DSH 的三条启动路径（CLI `bin.js`、桌面宿主、Web）都经 `runProfile`，`apply()` 运行时必然拿到 profile 目录。

### 2. 全局旧配置一次性导入

`migrateLegacyConfig` 在「profile 补丁尚未声明该字段」时导入 `$DSH_HOME/ponytail/config.json`，导入后把旧文件改名为 `config.json.imported` 使后续实例从干净状态启动。

不能按「profile 补丁有没有这一行」来判归属：全局文件是共享的，第一个启动的实例会认领它，后面的实例就永远拿不到自己的配置。

### 3. 优先级链降为三级

`env > patch > fallback`。config 层随下沉退役。

留着的理由不成立：config.json 在无 settings 服务的组合里仍作为回退读写目标，但不参与优先级链——留在链里就是一层永远不生效的空壳，而「看着能改其实不生效」正是这套面板最初要解决的坑。

### 4. 客户端必须显式 `$mount` 自己的贡献

（同批修复，根因与本决策相邻但独立）客户端此前只读 `ctx.get('remote.ponytail')` 却从未挂载。网关的命名空间不是按需自动开通的：`dsh-api-remotes/lib/client.js:13512` 只遍历一份编译期写死的 25 个官方贡献并逐个 `ctx.remote.$mount(...)`。宿主侧 `TypertRemoteService` 只负责暴露端点。客户端不 `$mount`，`remote.ponytail` 永不出现。

`$mount` 返回的 disposer 之前挂载已完成（内部 `await fiber`，`dsh-api-gateway/lib/client.js:1636-1646`），因此不需要轮询。40 次 x 50ms 的重试掩盖的是「压根没挂载」这个事实，而不只是时序。

`result.create` 不必是 zod：`requireStrictCodec` 只校验 `mode === 'strict'`（同文件 2073），返回值解码走 `result.decode`，缺省即原样透传（同文件 1801）。恒等函数即可。

## 后果

- **正面收益**：同机多实例互不干扰；诊断面板每一行的编辑动作都只影响当前实例；已发布与 HEAD 的配置语义统一。
- **兼容成本**：升级用户的当前档位会重置为 `full`（迁移读取的是 profile 内的新位置）。已在 CHANGELOG 与 README 写明。
- **删除**：`getLegacyConfigDir()` / `getLegacyConfigPath()` 的三条平台分支（`%APPDATA%` / `XDG_CONFIG_HOME` / `~/.config`）失去全部读取者，随之删除；`verify.mjs` 的对应豁免同时移除，现在 `src/` 下出现任何平台路径字面量直接判失败。

## 验证证据

- `node scripts/behavior.test.mjs`：85 项全绿（新增 1A profile 隔离、C13 贡献声明形状、锁定判定三条）。
- `node scripts/verify.mjs`：ALL PASS（平台路径门禁取消豁免后仍通过）。
- 隔离实例 `ponytail-hmr-e2e`（端口 19470）：热装（运行中 `pnpm install`，宿主不重启）后刷新页面即出现卡片，优先级三行渲染正确；点「激进」后补丁回读 `defaultMode: ultra`、面板回显「当前生效：ultra」、锁定提示消失。
- 隔离实例 `ponytail-official-config`（端口 19450）：补丁有 `defaultMode: full` 时面板显示「Profile 补丁 = full 生效中」；补丁无该字段时显示「(未设置)」且兜底行生效——两者可区分，正是 `Config.defaultMode` 不设 Schema 默认值的目的。