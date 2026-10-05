# flag / 配置下沉到 profile 的可行性评估（2026-10-05）

## 一、结论

**两件事都做得到，而且 CLI 不只是"兼容"——下沉之后 CLI 反而比现在更干净。**

关键证据：`profileContext` 服务由 `profile-boot` 的 `runProfile` 提供，而**所有真正启动插件树的入口都走 runProfile**。没有一条"跑起插件但没有 profileContext"的路径。

## 二、决定性证据

### 2.1 profileContext 只有一个提供点

在 `app.asar` 全量二进制中扫描：

| 模式 | 命中 |
| --- | --- |
| `provide("profileContext"` | **1** |
| `provide('profileContext'` | 0 |

命中点位于 `profile-boot` 的 `runProfile`：

```js
const profileContext = {
  name: options.profile,
  dir: composed.profile.dir,
  patchPath: composed.profile.patchPath,
  installAnchor: options.resolvedProfile?.installAnchor ?? INSTALL_ANCHOR,
  startedBundles: composed.profile.layers.map((layer) => layer.packageName),
  cwd: process.cwd(),
  home: resolveDshHome(),
  overlays: composed.overlays,
  telemetryDisabledEnv: process.env.DSH_TELEMETRY_DISABLED
};
const ctx = await boot(NAME, rootConfig, ..., async (hostCtx) => {
  hostCtx.provide("profileContext", profileContext);
  ...
});
```

### 2.2 三个真实启动入口全部经过 runProfile

| 入口 | 证据 |
| --- | --- |
| CLI 默认（web / headless / tui 等所有 profile 启动） | `lib/bin.js:212` `case "profile": await runProfile({...})` |
| 桌面版 GUI | `dsh-desktop-host` `main()` 内 `runProfile({ profile: "desktop", resolvedProfile: {...}, args: ["--no-open","--port","19387"] })` |
| CLI 子命令 `plugin` / `dump-config` / `dump-config-schema` | 根本不启动插件树（`bin.js:234-248`），与配置无关 |

CLI 的其余 mode（`bin.js:211-249`）里，只有 `case "profile"` 会 import `./profile-boot.js`。`headless` 不是独立 mode——`parseDshArgs` 在无 dump 参数时一律返回 `mode: "profile"`（`bin.js:68-72`）。

### 2.3 时序安全

`dsh-app-boot/lib/index.js:4052-4084` 的 `boot()`：

```js
await ctx.plugin(Loader);           // 4080
await prepare?.(ctx);              // 4081  <- profileContext 在这里 provide
await mountRootInclude(ctx, ...);  // 4083  <- 整棵插件树在这里挂载
await ctx.get("loader")?.await();  // 4084
```

`ponytail.apply()` 运行时 `profileContext` 必然已就位。

### 2.4 profileContext 在所有组合里都活着

`dsh-base` 的 `settings` 与 `config-editor` 行带 `disabled: !!js "!ctx.get('profileContext')"`。因为 2.1+2.2 证明 profileContext 无条件存在，这两行**永远不禁用**——包括 `headless`、`dsh-tui` 组合（已核对两者 bundle 补丁均未覆盖这两行）。

推论：`src/ponytail.ts` 里的 `createFileSink()` 回退分支与 `migrateLegacyConfig` 的 settings 守卫，在当前 DSH 上是**事实上的死代码**，只对 mock 宿主和裁剪宿主有意义。下沉后它可以彻底删除。

## 三、profile 目录放子目录是否安全

`profiles/<name>/` 下已有非标准目录：

```
web/.dsh-market, web/.omc, web/.plugin-manager, web/.backup-market-switch-20260815-123746, web/${APPDATA}
```

官方代码只碰这几个文件：`loadProfileDirectory` 读 `package.json` 与各 bundle 补丁；`sanitizeProfile` 只重命名 `cordis.patch.yml`。新增 `ponytail/` 子目录不影响任何逻辑。

## 四、改动清单与代价

```
src/ponytail.ts
  + readService(ctx, 'profileContext') 取 profileDir
  + 有 profileDir 时：storage 绑定 profileDir/ponytail
  + 迁移一次：全局 ponytail 目录 -> profiles/<name>/ponytail/

src/ponytail-config.ts
  + getConfigDir(profileDir?) —— 传 dir 则 join(dir,'ponytail')，否则旧全局路径
  - 删除 getLegacyConfigDir / getLegacyConfigPath（平台路径兼容读取，5.x 已到移除窗口）

src/ponytail-settings.ts
  - 删除 createFileSink（回退通道不再需要）
  ~ migrateLegacyConfig 改为读全局旧 config.json

src/ponytail-priority.ts
  ~ config 层改为读 profile 内 config.json；迁完一个大版本后再删该层

scripts/behavior.test.mjs
  ~ 约 12 处 DSH_HOME 路径断言改为 profile 维度
  + 新增：profileDir 缺失时回退全局路径的回归

scripts/verify.mjs
  ~ 平台路径豁免段（getLegacyConfigDir）整段删除
```

**不需要改 `ponytail-state.ts`**——它已经有 `storage` 注入缝（`src/ponytail-state.ts:25-29`），`apply()` 传入 profile 绑定的磁盘实现即可，模块内 `getConfigDir()` 调用随之消失。

## 五、需要主人裁决的两个点

### 5.1 迁移判据

单个实例的迁移不能只问"profile 补丁有没有这一行"，因为全局文件是所有实例共享的，一次导入会让先启动的实例独占它。

- **A（保守）**：只有当全局 flag 文件存在且 profile 内尚无 flag 时才导入，导入后把全局文件改名标记为已迁。语义清晰，但需要改全局文件。
- **B（惰性）**：不搬文件，只把 profile 内路径作为新真源；全局文件保留只读兼容，由主人手工清。diff 更小，但老用户的自定义默认档会静默回到 full。

### 5.2 config 优先级层的去留

`resolvePriority` 现在有四级。下沉后 `config` 层指向 profile 内 config.json。选项：

- 保留该层到 6.x，再删（迁移成本最低，优先级链形状稳定）
- 本次直接删（链变三级，UI 诊断链要重画）

## 六、验收方法

```
1. 隔离 profile 冷装：flag 与配置写入 profiles/<name>/ponytail/
2. 同机两个 profile 各设不同档：互不干扰（当前会互相覆盖）
3. 桌面 GUI 与 CLI 同 profile：共享同一 flag（应当一致）
4. headless 组合：确认走 settings 通道而非文件回退
5. 无 profileContext 的 mock 宿主：确认回退全局路径且不抛
6. 门禁：verify ALL PASS、behavior.test 全绿
```