# ponytail 配置作用域深度分析（2026-10-05）

## 一、直接回答

**"修改 ponytail 配置" 不是一个动作，而是六个不同落点的动作，它们的作用域各不相同。**

- 在**界面/命令里改"默认档 + 禁用技能"**：作用域取决于运行的是哪个版本的插件。
  - 已安装的已发布版本（`4.10.0-dsh.9`、npm 上的 `5.0.0`）→ **全局统一**，所有实例共用 `$DSH_HOME/ponytail/config.json`。
  - 本地 HEAD（`v5.0.0-7-gfaef1ff`，尚未发布）→ **每个 profile 独立**，写入各自的 `profiles/<name>/cordis.patch.yml`。
- 无论哪个版本，**运行时等级状态（flag 文件 `.ponytail-active`）永远是全局统一**的，所有实例共用一个文件，并且每次注入提示词前都会重读它。

所以当前机器上同时存在两种语义，且它们会互相打架。

## 二、六个配置落点与真实作用域

| # | 落点 | 物理位置 | 作用域 | 代码证据 |
| --- | --- | --- | --- | --- |
| 1 | 默认档 / 禁用技能（官方通道） | `profiles/<name>/cordis.patch.yml` 的 `ponytail` 行 | **单实例** | `src/ponytail-settings.ts:96` → `ctx.settings.mutate` → `dsh-config-editor/lib/index.js:24-25` `documentPath = ctx.profileContext.patchPath` → `dsh-app-boot/lib/index.js:588` `patchPath = join(dir, "cordis.patch.yml")` |
| 2 | 默认档 / 禁用技能（文件回退） | `$DSH_HOME/ponytail/config.json` | **全局共享** | `src/ponytail-config.ts:80-86` `getConfigDir() = join(resolveDshHome(), 'ponytail')`；`src/ponytail-settings.ts:149` `createFileSink()` |
| 3 | 运行时等级 flag | `$DSH_HOME/ponytail/.ponytail-active` | **全局共享** | `src/ponytail-state.ts:68-70` `statePath() = join(getConfigDir(), '.ponytail-active')` |
| 4 | 环境变量 `PONYTAIL_DEFAULT_MODE` | 进程环境 | **全局共享**（继承） | `src/ponytail-priority.ts:20`；`src/ponytail.ts:158` |
| 5 | home 层用户补丁 | `$DSH_HOME/cordis.patch.yml` | **全局共享**（覆盖所有 profile） | `dsh/lib/profile-boot-BZ2ZjNWi.js:110-116` `homePatchPath()`；当前内容为 `[]` |
| 6 | 插件包版本 | `profiles/<name>/node_modules` | **单实例** | 各 profile 的 `package.json` 依赖各自独立 |

关键事实：**`DSH_HOME` 不含 profile 维度**。`resolveDshHome()` 只解析 `$DSH_HOME` 或 `~/.dsh`（`src/ponytail-config.ts:69-74`），profile 只出现在 `profiles/<name>/` 这一层。因此落在 `$DSH_HOME/ponytail` 下的任何文件天然跨实例共享。

## 三、优先级链与各层归属

`resolvePriority` 是唯一真源（`src/ponytail-priority.ts:71-105`），四级从高到低：

```
env (PONYTAIL_DEFAULT_MODE)      → 全局共享
patch (cordis.patch.yml)          → 单实例（HEAD）/ 不存在（已发布版）
config (config.json)              → 全局共享
fallback (代码常量 full)          → 编译期常量
```

已发布版本没有第 2 层（volatile Config 是 tag 之后才加的），所以它们的有效链只有三级，默认档实际由**共享的 config.json** 决定。

## 四、各实例当前实际形态

```
桌面 GUI（你现在这个窗口）
  profile: desktop         插件: 4.10.0-dsh.9（npm 目录实体包）
  进程 PID 83000，启动于 2026-10-04 01:08
  写入路径: config.json（全局共享）
  补丁里没有 ponytail 行

Web profile（127.0.0.1:3080）
  插件: 5.0.0（npm 发布产物，含 ponytail-http.js，无 ponytail-settings.js）
  写入路径: config.json（全局共享）
  补丁里没有 ponytail 行

ponytail-official-config（127.0.0.1:19430）
  插件: link:E:/newCC/aaa-dsh-go/dsh-ponytail（本地 HEAD）
  写入路径: profiles/ponytail-official-config/cordis.patch.yml（单实例）
  补丁里有唯一一行 ponytail 配置: defaultMode: ultra
```

磁盘真值（`C:\Users\Administrator\.dsh\ponytail\`）：

```
.ponytail-active  -> "full"        （最后写入 2026-10-05 14:41:38）
config.json       -> {"defaultMode":"full","disabledSkills":[]}
```

## 五、跨实例串扰链路（可复现推演）

```
19430 实例启动
  resolvePriority: patch(ultra) 命中  → state.set("ultra") → 写共享 flag = "ultra"

桌面 GUI 任意时刻启动新会话
  resolvePriority: patch(无) → config.json = "full" 命中 → state.set("full")
  → 写共享 flag = "full"          ← 覆盖了 19430 的 ultra

19430 下一次注入提示词
  renderPromptSection → state.syncFromFile()   （src/ponytail-instructions.ts:96）
  → 读到 "full" → 面板显示 full，ultra 设置形同虚设
```

这不是假设。`src/ponytail-state.ts:161-177` 的 `syncFromFile()` 语义是"文件赢"，且 `src/ponytail-instructions.ts:96` 每次注入前都调它；`src/ponytail.ts:395-398` 每次 `agent/created` 都会 `syncToFile()` 把自己的等级写回同一个文件。多实例并存时，最后启动会话的实例决定全局 flag。

## 六、根因判断

`ADR-0004` 移除了多宿主探测并写下"DSH 单一宿主，flag 缺失即关闭"，`ADR-0005` 把配置统一收进 `$DSH_HOME/ponytail`。两条决策都建立在一个当时成立的前提上：**一个用户同时只有一个 DSH 实例在跑**。

DSH 现在的实际形态否定了这个前提——`$DSH_HOME/profiles/` 下有 28 个 profile，同一时刻可以跑十几个实例（当前就有 7 个 node 进程）。共享 flag 的设计因此从"简化"变成了"串扰源"。

## 七、待决问题（需要主人裁决，本轮不改代码）

1. **flag 是否应下沉到 profile 维度**：`$DSH_HOME/profiles/<name>/ponytail/`。代价是跨 profile 切档要改两次。
2. **config.json 是否退役**：迁入 profile 补丁后它只剩 headless/CLI 回退用途；这些组合是否也需要 profile 隔离。
3. **已发布版本与 HEAD 的语义分叉是否可接受**：升级到 HEAD 的实例配置独立，未升级的仍全局共享，同机并存时行为不一致。

## 八、验证方法

本报告全部结论来自以下可复现读操作，无推断成分：

- `node scripts/verify.mjs` → ALL PASS
- `node scripts/behavior.test.mjs` → 78 pass / 0 fail
- 直接读取 `dsh-app-boot`、`dsh-config-editor`、`dsh-settings`、`profile-boot` 的已安装源码
- 直接读取 28 个 profile 的 `cordis.patch.yml`、`package.json` 与已安装插件产物
- `Get-CimInstance Win32_Process` 确认在跑实例的 profile 与插件版本
