# 5. 配置与 flag 统一归入 DSH 用户数据根（跨平台一致）

- **状态 (Status)**: 已采纳 (Accepted)，作用域由 [ADR-0009](0009-profile-scoped-config-and-flag.md) 修订
- **日期 (Date)**: 2026-10-02
- **决策者 (Deciders)**: Ponytail 架构小组
- **修订对象**: [ADR-0004](0004-dsh-single-host-runtime.md) 的目录落地细节

## 背景与上下文 (Context)

ADR-0004 把 flag 收敛到「DSH 配置目录」，但当时把「DSH 配置目录」理解成了宿主平台的传统用户配置目录：

- Windows: `%APPDATA%\ponytail`
- macOS / Linux: `~/.config/ponytail`

两处证据表明这个落点不符合 DSH 官方契约：

1. **官方数据根约束**：`@deepseek-ai/dsh-home-paths` 的类型声明明确写道 "the harness keeps all user
   data under one root"，其 `resolveDshHome()` 给出 `$DSH_HOME`（默认 `~/.dsh`）唯一数据根。
   该包被 `dsh-skill-filesystem`、`dsh-credentials-local`、`dsh-app-boot`、`dsh-attachment-local` 等
   官方包共同使用，配置、凭据、profile 附件全部落在该根之下。
2. **可观测后果**：配置落在数据根之外导致三类实际缺陷——
   - 用户备份或迁移 `$DSH_HOME` 时插件配置与 flag 一并丢失；
   - 设置 `DSH_HOME` 切换环境（profile 隔离）时配置不跟随，多环境互相污染；
   - Web GUI 面板文案写死 `%APPDATA%\ponytail\config.json`，在 macOS / Linux 上直接是错误信息。

## 架构决断 (Decision)

**配置与 flag 统一归入 `$DSH_HOME/ponytail`**：

1. `getConfigDir()` 改为 `join(resolveDshHome(), 'ponytail')`，删除 `XDG_CONFIG_HOME` /`APPDATA` /
   `process.platform === 'win32'` 三条平台分支；路径分隔符一律由 `node:path` 生成，
   代码中不再存在任何平台判断（跨平台正确性由结构性保证，而非逐平台测试）；
2. `resolveDshHome()` 在 `src/ponytail-config.ts` 内逐行复刻官方语义（explicit > `$DSH_HOME`
   （空白视为未设置）> `~/.dsh`，`~` 前缀展开），**不 import 官方包**。
3. flag（`.ponytail-active`）与 `config.json` 同源，`ponytail-runtime.ts` 经 `getConfigDir()`
   间接取值，零改动自动跟随；
4. 旧位置仅保留**一次性兼容读取**（新位置缺失时回退读旧 `config.json`），写入永远只写新位置，
   旧目录不删除也不改写。

## 为何不 import `@deepseek-ai/dsh-home-paths`（关键权衡）

实测（Node 动态 import）：

| 解析视角 | 结果 |
| --- | --- |
| 从 DSH 包内部 | 成功，返回 `C:\Users\Administrator\.dsh` |
| 从插件实际运行视角 | `ERR_MODULE_NOT_FOUND` |

该包由 DSH 宿主提供、不随插件安装，因此：

- **静态 import**：真实用户环境加载即崩，直接否决；
- **动态 import 惰性预热**：官方实现是 6 行纯函数，异步预热会让「用官方值还是本地值」随调用时机漂移，
  同一进程内 `getConfigDir()` 可能返回两个不同结果，行为不确定，否决；
- **本地等价复刻**：确定性、零依赖、跨平台无分支。契约漂移风险（官方未来改了语义）由
  `scripts/behavior.test.mjs` 中的优先级与展开断言 + `scripts/verify.mjs` 的路径静态门禁双重兜底。

## 影响与后果 (Consequences)

- **正面收益**：三平台行为完全一致；`$DSH_HOME` 覆盖天然生效；备份 / 迁移数据根即带走配置；
  面板与文档不再出现平台特定路径。
- **妥协权衡**：升级用户的当前等级会重置为默认（`full`）——因为会话启动对齐语义每次按默认档重写 flag；
  已自定义的 `defaultMode` 与 `disabledSkills` 通过旧位置兼容读取保住，不会静默丢失。
- **清理时机**：已完成。`getLegacyConfigDir()` / `getLegacyConfigPath()` 及其三条平台分支
  （`%APPDATA%` / `XDG_CONFIG_HOME` / `~/.config`）已随 ADR-0009 的一部下沉删除，
  `scripts/verify.mjs` 对应豁免同时移除。

## 验证证据 (Verification)

- `resolveDshHome()` 优先级实测：unset → `~\.dsh`；`DSH_HOME=E:/tmp/x` → `E:\tmp\x`；
  空白 → `~\.dsh`；`DSH_HOME=~/mydsh` → 家目录展开；explicit → 最高优先级。
- 行为单测 33 → 36 项全绿（新增数据根优先级、配置目录落点、旧位置兼容读取三项）。
- ADR-0009 落地后为 85 项全绿。
- 静态门禁 `node scripts/verify.mjs` ALL PASS（8 产物、6 技能、零 Tool 注册）。
