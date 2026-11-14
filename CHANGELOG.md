# Changelog

本项目所有值得记录的变更都记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [5.6.3] - 2026-11-14

### Changed

- 删除 `apply` 里赋值后从未读取的 `settingsService` 变量。通道选择由 `createSinkFor` 内部的 `readService` 完成。

### Fixed

- 修复 `scripts/verify.mjs` 的宿主版本门禁：旧实现用字符串 `includes('<=0.2.1')` 判断覆盖范围，在 `engines.dsh` 升级到 `>=0.2.2-rc.1` 后把发布门禁永久打成 FAIL（`prepublishOnly` 因此必断）。
- 判据改为「`engines.dsh` 下界与 dsh 系 `peerDependencies` 同代」，抽成纯函数 `scripts/verify-engine.mjs` 并配 4 条测试，不再依赖写死的旧版本字符串。
- 纠正 `ponytail-config.ts` 与 `ponytail-settings.ts` 里「向后兼容接缝」的注释。这些薄委托函数在生产代码里没有调用者，但行为测试用它们验证落盘形态、字段级 merge 与重置语义，是配置读写的可测试表面。

## [5.6.2] - 2026-10-24

### Fixed

- 放宽依赖版本范围，全面支持 DSH 0.2.1 全版本系列，包括后续候选版与正式版。
- `engines.dsh` 调整为 `>=0.2.0-rc.1 <=0.2.1`，修复 DSH 0.2.1 系列被宿主预发布支持语义误判为不兼容从而被拦截安装的问题。
- `peerDependencies` 中 `@deepseek-ai/dsh-skill` 与 `@deepseek-ai/dsh-typert-protocol` 同步放宽至 `>=0.2.0-rc.1 <=0.2.1`，消除安装时的依赖冲突警告。

## [5.6.1] - 2026-10-18

### Fixed

- 修复发布包在 DSH 0.2.1-rc.2 宿主环境下的安装兼容性报错。
- `peerDependencies` 中 `@deepseek-ai/dsh-skill` 与 `@deepseek-ai/dsh-typert-protocol` 范围调整为 `>=0.2.0-rc.1 <=0.2.1-rc.2`，修复此前版本范围导致宿主插件管理器拒绝安装的问题。
- 显式声明 `engines.dsh: >=0.2.0-rc.1 <=0.2.1-rc.2`，让 0.2.1-rc.2 宿主优先依据该字段判定兼容性。
- 保持对 0.1.x 旧版历史包袱的拒绝，坚守不兼容旧版的原则。

## [5.6.0] - 2026-10-17

### Changed

- 全面适配 DSH v0.2.1-rc.2 架构，移除旧版兼容包袱。
- `package.json` 引入 v0.2.1-rc.2 新增的 `engines.dsh: >=0.2.1-rc.1` 插件版本兼容性优先判断声明。
- `peerDependencies` 与 `devDependencies` 升级锁定为 `0.2.1-rc.2` 体系，涉及 `@deepseek-ai/dsh-skill` 与 `@deepseek-ai/dsh-typert-protocol`。
- 删除旧版全局路径函数 `getSharedConfigPath()` 及其跨层回退探测，配置文件直接定位当前 profile 目录。
- 删除 `migrateLegacyConfig` 函数与 `LegacyMigrationDeps` 接口，移除向 `.imported` 重命名的旧版迁移代码。
- 移除启动阶段对旧配置文件的一次性迁移调用与相关死代码导入，精简启动链路。

### Fixed

- 修复全局模式设为 `'off'` 时的归一化边界：内存 `current` 归一为 `null` 并彻底删除 `.ponytail-active` flag 文件，所有跟随型会话的 `effectiveMode` 同步归一为 `null`，严格保持单一关闭契约。

## [5.5.0] - 2026-10-10

### Added

- 新增统一存储自愈内核：提炼通用 JSON 语法轻度清洗与未闭合括号对齐补全的纯函数 `repairJsonSyntax`。
- 新增损坏文件留样备份器 `backupCorruptedFile`，按文件名留样轮转，最多保留 3 份历史案发现场。
- `salvageConfig` 字典初始化升级为 `Object.create(null)`，防止原型链继承假阳性与原型污染。
- 会话存储接入同一自愈内核：删除手写重复的括号计数与正则抽取样板，`session-states.json` 接入损坏留样备份，具备与配置文件同等的崩溃自愈能力。
- 会话目标提取函数 `resolveSessionId` 下沉至基础无状态模块 `src/ponytail-config.ts`，统一为单一真源，指令模块与命令模块消除循环依赖。

## [5.4.0] - 2026-10-09

### Added

- 模式切换零缓存破坏机制：顶层 SystemPrompt 在会话生命周期内锁定初始 `baselineMode`，会话期间前缀文本恒定，保护 KV Cache 与 Prompt Cache 命中率。
- 模式切换统一通过 `agent/pre-step` 拦截点在最新轮次用户消息末尾追加一次 `<system-reminder>` 更新通知，后续未切档轮次幂等稳定，不重复追加。
- 状态管理器引入 `SessionModeState`，按访问序 LRU 淘汰，上限 100 会话；`explicitlySet` 显式设置意图守卫保证全局修改不覆盖用户显式锁定的会话。
- 新增轮次拦截深模块 `TurnCoordinator`，完整封装消息提取、指令解析、waterfall 穿透、变动对比、原地替换与发射标记落盘，宿主入口移除 90 余行消息拼接胶水代码。
- 提示词引擎收敛唯一生产出口 `renderPromptSection`，在模块内部接管会话基线锁定与无会话降级判定。
- 存储适配器全虚拟化：扩展 `PonytailStorage` 契约支持会话状态持久化映射解耦，新增纯内存适配器 `createMemoryStorage`，单元测试零触碰磁盘。

### Fixed

- 技能描述语言控件的「自动跟随宿主」段改为常驻：此前该段按配置是否被写过为条件追加，手动锁过一次语言后该段消失、无法切回跟随宿主；三态恒定，选中值只反映配置态。
- 清理 `src/ponytail-remote.ts` 与 `src/ponytail.ts` 中的死导入，精简依赖树。

## [5.3.2] - 2026-10-06

### Changed

- 完善安装、热加载与配置说明，段落空行规范化，安装指引显式锁定最新版本 `@5.3.2`。
- 明确插件基于纯 `insert:` overlay 机制，安装后无需且严禁手动修改 `cordis.patch.yml`。

## [5.3.1] - 2026-10-06

### Fixed

- 安装与配置指引修正为完全零配置热安装与热卸载，无需手动编辑 `cordis.patch.yml`。
- 宿主 `dsh-hmr` 自动监听配置变更，安装后等待 2 至 3 秒刷新浏览器即可自动加载配置卡，界面点击由宿主自动持久化写入。
- 热卸载后用户配置完好保留在 profile 补丁中，热安装新版本后自动继承原配置并生效。

## [5.3.0] - 2026-10-06

### Fixed

- 安装指引修正：`dsh plugin add` 不写 profile 的 `cordis.patch.yml`，包自带补丁只以 `insert:` overlay 形式合进启动树，热装后卡片不渲染；文档明确「安装后手动补顶层条目 + 重启宿主」及其判据。
- 修正此前把包内补丁改成顶层条目的行为，该行为会污染 overlay 合成导致补丁条目找不到，已回滚为 `insert:` 形态。

### Changed

- `skillDescriptionLang` 改为三态语义并去掉 Schema 默认值：未配置时跟随宿主 `locale.preference` 选择，仅英文时对齐英文、其余兜底中文；显式中文与显式英文可区分。
- 面板语言控件新增「自动跟随宿主」段。
- 宿主语言运行期变更时经 `app-boot/config-reload` 失效技能目录，语言切换即时生效。

## [5.2.0] - 2026-10-06

### Added

- 新增技能描述语言开关 `skillDescriptionLang`，默认中文，面板在「原生技能开关」段内切换；两套描述真源为 `skills/descriptions.zh.json` 与 `skills/descriptions.en.json`，经 remote 快照下发，切换后模型目录与界面同时生效。
- 版本对照的唯一落点改到 `CLAUDE.md`，README 不再写版本号。

### Changed

- 六个技能正文与 hook 注入文本回归上游 DietrichGebert/ponytail v4.10.3 英文原文，模型读到的指令不再与上游分叉；`ponytail-gain` 的数据来源指向本仓 `assets/*.svg`，`ponytail-help` 的配置与更新章节改为 profile 补丁与 `dsh plugin`。
- 技能描述从构建期内嵌常量改为 remote 快照下发，语言由配置决定，构建期常量会停留在旧语言。
- 修复 `scripts/version.mjs` 在 Windows 下写盘失败的问题：入口路径改经 `pathToFileURL` 归一。

### Fixed

- 等级控件只显示补丁里真实配置的档位：未配置时显示「未设置」段与提示，此前会把运行时推导的兜底档显示成用户已选。
- README 补充说明补丁条目必须写在顶层：宿主不为包自带补丁管理 `config` 块，面板写入永远被拒。
- 修复 `t()` 键收集正则漏掉含大写字母的键的问题，缺键时界面会静默显示键名。
- 技能卡与 README 同步三级链与 profile 落点。

## [5.1.0] - 2026-10-05

### Changed

- 配置与 flag 的落点从全局数据根改为 profile 目录 `profiles/<name>/ponytail/`，同机多实例不再共享 `$DSH_HOME/ponytail`；升级用户当前档位重置为 `full`。
- 优先级链从四级降为三级 `env > patch > fallback`，`config.json` 层退役。
- 配置卡改用官方插件配置组合：两个可持久化字段声明为 `.volatile()`，客户端经 `ctx.configForms.get('ponytail')` 读写。
- `patchMode` 改为实时读取 volatile 引用，不再缓存启动快照。
- 技能启用态的失效触发点改为监听宿主 `loader/volatile-update`。

### Added

- 配置与 flag 的 profile 维度，目录来自宿主 `profileContext.dir`。
- `src/ponytail-settings.ts`：settings 通道写入 profile 补丁并带 revision 冲突保护；无 settings 服务时回退读写 profile 内 `config.json`；旧全局 `config.json` 一次性导入后改名。
- `src/ponytail-remote.ts`：`TypertRemoteService` 子类，只读端点 `snapshot()` 返回当前等级与诊断链。
- 客户端 Remote 贡献声明：此前只读命名空间从未挂载，网关不会按需开通它，面板因此长期显示「诊断信息不可用」；同时移除窗口轮询。

### Removed

- `src/ponytail-http.ts` 与自制端点、`webServer` 注入。
- `apply()` 里对 `settings.register()` 的调用，该方法是 dsh-settings 不存在的接口，属于从未生效的死代码。
- 平台位置兼容读取，包括 `%APPDATA%`、`XDG_CONFIG_HOME` 与 `~/.config`。

### Fixed

- 技能禁用开关此前改完模型侧目录不收敛，现由 loader 的 volatile 提交事件驱动失效。
- 等级选择器把兜底命中当成更高优先级的配置，导致按钮永久禁用且提示失实；改为只认 env 命中。

## [5.0.0] - 2026-10-04

### Changed

- 版本从 `4.10.0-dsh.12` 切换为独立的标准 SemVer，不再生成 `-dsh.N` 预发布后缀。
- README、架构记录与发布流程明确区分本地版本与上游参考版本。

### Fixed

- 客户端 locale 字典改为 DSH 要求的扁平键，避免界面显示裸 key。

## [4.10.0-dsh.12] - 2026-10-04

### Fixed

- 默认档持久化后 HTTP 诊断仍读旧快照，配置端点改用实时 getter。
- systemPrompt 生产接线此前绕过 `renderPromptSection`，修复为走统一出口。

## [4.10.0-dsh.11] - 2026-10-04

### Fixed

- 移除客户端产物中内嵌的宿侧死代码 `import.meta`：该表达式在浏览器解析时直接抛 SyntaxError，导致整个客户端 bundle 加载失败、面板静默消失。
- 修复默认档命令层分裂：apply 与 UI 面板走含 patch 层的 `resolvePriority`，命令调度器未注入时却落到不含 patch 层的 `getDefaultMode()`，两种解析结果不一致时 `/ponytail foobar` 会把等级切错；三条消费路径统一真源。

### Changed

- `config.json` 读侧收敛为单一解析出口。
- HTTP 快照合并为单次求值。
- 技能禁用补文件的写入优先级收敛与纯函数判定。

### Removed

- `src/ponytail-runtime.ts` 这层 46 行薄壳内联进 `ponytail-state.ts`。

## [4.10.0-dsh.10] - 2026-10-04

### Added

- 客户端面板接入官方 `ctx.locale`，36 键双语字典，语言切换即时刷新。
- HTTP 配置端点剥离为独立深工厂，依赖全注入，不触碰 `ctx`。
- 技能元数据单一真源：`SKILL.md` frontmatter 为唯一真源，删除两处已漂移的硬编码。

### Changed

- 优先级统一以 `resolvePriority` 为唯一真源；行为变更：patch 的大小写变体与非法值从「生效」改为「忽略」。
- 配置写盘改为字段级 merge，保留用户手写的未知字段；非法 `defaultMode` 拒绝写盘。
- 修复 `providerInstance` 死变量：UI 改禁用技能后模型侧目录此前不刷新。

### Removed

- 两个孤儿函数与失效类型；HTTP 端点从 `apply()` 剥离。

## [4.10.0-dsh.9] - 2026-10-04

### Removed

- 移除四条多余 UI 落点，包括设置窗口 Tab、侧边栏按钮、全局浮层与插件条目：设置面板从 0.6 起就正常显示在插件卡片详情，多余落点让同一面板在三处重复出现。
- 卡片配置只以包名注册一个 key，bundle id 那条永不命中，予以删除。

## [4.10.0-dsh.8] - 2026-10-04

### Added

- 两条常驻 UI 落点：侧边栏按钮与全局浮层，上游参照实现从不把可见性赌在单一页面上。

### Changed

- UI 落点由三条扩为五条。

## [4.10.0-dsh.7] - 2026-10-04

### Added

- 设置窗口一级 Tab 作为保底入口，不经插件管理页。
- 卡片配置双 key 保险：包名与 bundle id 同时注册，只渲染一份。

### Fixed

- 桌面版设置界面仍无面板：插槽 spec 缺失时回调永不执行且零报错，插件页链路不通时前两条落点同时失效且无任何错误信号；补上不依赖插件管理页的入口。

## [4.10.0-dsh.6] - 2026-10-03

### Added

- 官方插件页通道 `plugins.item`，组件按视图分态。
- 宿侧设置命名空间注册，插件页据此提供配置表单。

### Fixed

- 桌面版设置界面无任何 UI 的根因修复：此前只挂插件卡片详情，而宿侧从未注册命名空间，整块面板静默消失。
- 设置表单与 `config.json` 真源对齐，避免界面上改了、运行却不生效。
- `ctx.inject` 缺失时的降级守卫。

## [4.10.0-dsh.5] - 2026-10-03

### Added

- 运行等级四级优先级诊断：新增 `src/ponytail-priority.ts` 纯函数模块产出诊断链，解决「界面点了等级却没反应」长期无诊断手段的问题。
- 客户端改用 DSH 原生组件族，不再手写内联视觉。
- 删除 `src/client.ts`：与构建脚本重复产出同一产物，必然漂移。
- 配置与 flag 统一归入 DSH 用户数据根。

### Changed

- 跨平台一致性修复：路径一律由 DSH 数据根解析，删除三条平台分支。
- 旧位置的 `config.json` 一次性兼容读取，写入只落新位置；升级后当前等级按默认档重写；旧的 `.ponytail-active` 不做兼容读取。

## [4.10.0-dsh.4] - 2026-10-02

### Added

- 状态存储切面：磁盘与内存两个适配器，消除测试对环境变量的强依赖。
- 提示词模块单一出口 `renderPromptSection`。

## [4.10.0-dsh.3] - 2026-10-02

### Changed

- 收窄为 DSH 单一宿主：删除 Copilot、Codex、Qoder 三路平台探针与外部宿主分支，flag 固定落在 DSH 配置目录。

### Fixed

- `config.json` 默认档被 Cordis 缺省填充 shadow：schema 去掉 `.default('full')` 后缺省才走 `getDefaultMode()`，否则 `/ponytail default <mode>` 持久化的值在下一会话被静默覆盖回 full。

## [4.10.0-dsh.2] - 2026-10-02

### Changed

- 命令调度深模块化，插件入口骨架瘦身。
- 发布载荷瘦身：删除与 logo 完全重复的 dark 版，发布包体积降到约五分之一。

### Fixed

- 配置写入补 `try/catch` 守卫，防止磁盘写保护与文件锁异常击穿上层。
- 技能解析补 BOM 与分隔行容错，frontmatter 示例行正则兼容中文引号。
- `AbortSignal` 已中止时立即抛 `AbortError`。

## [4.10.0-dsh.1] - 2026-10-01

### Changed

- 架构深化：等级状态收敛为深模块、指令渲染收敛为单一出口、SkillProvider 抽为独立子系统，插件入口由 533 行降至 272 行。

## [4.10.0-dsh.0] - 2026-10-01

### Added

- 完整移植上游 v4.9.0：6 个 Skill、常驻梯子注入并随档位动态裁剪、六个 hook 行为的中文复刻。
- 新增 `CLAUDE.md` 记忆库、`LICENSE`、`README`、`assets`、`AGENTS.md`。

### Fixed

- `agent/session-start` 是 DSH 不存在的事件，原监听永不被触发，迁为 `agent/created`。
- 未知参数语义对齐上游 else 兜底：静默切换到默认等级。

## [4.9.0-dsh.0] - 2026-08-21

### Added

- 首个 DSH 移植版本：单一插件包，`dsh.bundle.patch` 挂载，`PONYTAIL_DEFAULT_MODE` 三级回退且 `review` 不可作默认，全部文案中文化，触发词兼容中英文。

[Unreleased]: https://github.com/Wenaixi/dsh-ponytail/compare/v5.4.0...HEAD
[5.4.0]: https://github.com/Wenaixi/dsh-ponytail/compare/v5.3.2...v5.4.0
[5.3.2]: https://github.com/Wenaixi/dsh-ponytail/compare/v5.3.1...v5.3.2
[5.3.1]: https://github.com/Wenaixi/dsh-ponytail/compare/v5.3.0...v5.3.1
[5.3.0]: https://github.com/Wenaixi/dsh-ponytail/compare/v5.2.0...v5.3.0
[5.2.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v5.2.0
[5.1.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v5.1.0
[5.0.0]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.12...v5.0.0
[4.10.0-dsh.12]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.11...v4.10.0-dsh.12
[4.10.0-dsh.11]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.10...v4.10.0-dsh.11
[4.10.0-dsh.10]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.9...v4.10.0-dsh.10
[4.10.0-dsh.9]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.8...v4.10.0-dsh.9
[4.10.0-dsh.8]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.7...v4.10.0-dsh.8
[4.10.0-dsh.7]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.6...v4.10.0-dsh.7
[4.10.0-dsh.6]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.5...v4.10.0-dsh.6
[4.10.0-dsh.5]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.4...v4.10.0-dsh.5
[4.10.0-dsh.4]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.3...v4.10.0-dsh.4
[4.10.0-dsh.3]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.2...v4.10.0-dsh.3
[4.10.0-dsh.2]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.1...v4.10.0-dsh.2
[4.10.0-dsh.1]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.0...v4.10.0-dsh.1
[4.10.0-dsh.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v4.10.0-dsh.0
[4.9.0-dsh.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v4.9.0-dsh.0