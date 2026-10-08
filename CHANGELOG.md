## [Unreleased]

## [5.4.0] - 2026-10-09

### Added

- 模式切换零缓存破坏机制（对齐官方 `renderCatalogUpdate` 范式，ADR-0012）：
  - 顶层 SystemPrompt（`order: 50`）在会话生命周期内绝对锁定初始 `baselineMode`，会话期间前缀文本逐字节完全恒定，100% 保护历史 KV Cache / Prompt Cache 命中率；
  - 模式切换（会话内命令切档或全局默认档变更）统一通过 `agent/pre-step` 瀑布流拦截点在当前最新轮次用户消息末尾追加一次带有 `<system-reminder>` 的更新通知（`renderModeUpdate`），后续未切档轮次幂等稳定，绝不重复追加；
  - 状态管理器引入 `SessionModeState`，支持访问序 LRU 淘汰（上限 100 会话）与 `explicitlySet` 显式设置意图守卫，全局修改不覆盖用户显式锁定的会话，新会话以新全局档纯净启动。
- 轮次拦截生命周期深模块 `TurnCoordinator`（ADR-0013）：
  - 完整封装消息纯文本提取、指令语法解析、下游 waterfall 穿透、变动对比、原地替换/追加与发射标记落盘 7 步调用流；
  - 严格捍卫不断链、KV Cache 零破坏、单通知幂等、发射标记收敛时机、多会话隔离与只读安全 6 大不变量；
  - 宿主入口 `src/ponytail.ts` 消除 90+ 行底层消息拼接胶水代码，大幅提升 Locality 与 Leverage。
- 提示词引擎唯一生产出口收敛 `renderPromptSection`（ADR-0013）：
  - 扩展方法签名，在模块内部自洽接管会话基线锁定与无会话降级判定，修复名存实亡的单出口裂痕；
  - 坚决杜绝类内部内存模板缓存，严守 ADR-0003 同步直读铁律。
- 存储适配器全虚拟化 `StateStorageAdapter`（ADR-0013）：
  - 扩展 `PonytailStorage` 契约，支持会话状态持久化映射解耦；
  - 导出 `createMemoryStorage` 纯内存适配器，使单元测试物理零触碰磁盘，彻底消除测试脏文件残留与并发竞争。
- 行为测试套件扩充至 **107 项全绿**：
  - 新增 C27（TurnCoordinator 端到端拦截与幂等性）、C28（会话事件兜底通道）与 C29（内存存储适配器纯内存隔离）回归锁。

### Fixed

- 技能描述语言控件的「跟随宿主（自动）」段改为常驻：此前该段按「补丁是否已写 `skillDescriptionLang`」条件追加，用户手动锁过一次中文或英文后该段消失，无法再切回跟随宿主，只能在中英之间横跳。「跟随宿主」是三态之一而非一次性占位选项，因此三段恒定、选中值只反映配置态。
- 清理 `src/ponytail-remote.ts` 与 `src/ponytail.ts` 中的死导入（`readdirSync`、`dirname`、`join`、`parseYaml`），精简依赖树。

## [5.3.2] - 2026-10-06

### Documentation

- 完善安装、热加载与配置说明：排版细节与段落空行规范化，安装指引显式锁定最新版本 `@5.3.2`。
- 固化零配置体验：明确插件基于纯 `insert:` overlay 机制，安装后无需且严禁手动修改 `cordis.patch.yml`。

## [5.3.1] - 2026-10-06

### Fixed

- 安装与配置指引彻底正名：支持完全零配置热安装与热卸载，严禁且无需手动编辑 `cordis.patch.yml`。
  宿主 `dsh-hmr` 自动监听 `package.json` 与 `cordis.patch.yml`（Chokidar `awaitWriteFinish: true`，2 秒写入防抖）。安装后等待 2 至 3 秒刷新浏览器即可自动加载配置卡；界面点击档位（如「激进」）由宿主 `config-editor` 自动在补丁中完成持久化写入。
  热卸载后用户配置完好保留在 profile 补丁中；热安装新版本后自动无缝继承原配置并生效。

## [5.3.0] - 2026-10-06

### Fixed

- 安装指引：`dsh plugin add` 不写 profile 的 `cordis.patch.yml`，包自带补丁（`insert:`，bundle 惯例）只作为 overlay 层合进启动树，因此热装后卡片不渲染。文档明确「安装后手动补顶层条目 + 重启宿主」与判据（`--dump-config` 报 `patch: entry not found` / 卡片「不包含任何组件」）。`verify.mjs` 相应把断言从「顶层 `- id: ponytail`」改为「保持 `insert:` 形态」——此前 `feat(skillDescriptionLang 三态化)` 误把包内补丁改成顶层条目，实测会污染 overlay 合成（`patch: entry not found`），已回滚。


### Changed

- `skillDescriptionLang` 改为三态语义并去掉 Schema 默认值：未配置（跟随宿主 `locale.preference` 显式选择，仅英文触发对齐、其余兜底中文）与显式中文/英文可区分；面板语言控件新增「跟随宿主（自动）」段。宿主语言运行期变更经 `app-boot/config-reload` 失效技能目录（ADR-0011）。

## [5.2.0] - 2026-10-06

### Added

- 技能描述语言开关 `skillDescriptionLang`（默认中文），面板在「原生技能开关」段内切换。两套描述真源为 `skills/descriptions.{zh,en}.json`，经 remote 快照下发，切换后模型目录与界面同时生效；`loader/volatile-update` 命中该字段即触发技能目录失效，否则模型侧读旧语言。
- 版本对照的唯一落点改到 `CLAUDE.md`（ADR-0010）。README 不再写版本号。

### Changed

- 六个技能正文与 hook 注入文本回归上游 DietrichGebert/ponytail v4.10.3 英文原文（按 tag 逐文件取回），模型读到的指令不再与上游分叉。两处对 DSH 不适用的上游内容就地改写：`ponytail-gain` 的数据来源指向本仓 `assets/*.svg`，`ponytail-help` 的配置与更新章节改为 profile 补丁与 `dsh plugin`。
- 技能描述从构建期内嵌常量改为 remote 快照下发：语言由配置决定，构建期常量会停在旧语言。描述长度断言对象随之改为描述文件（官方 `catalogDescriptionMaxLength` 默认 500，SKILL.md frontmatter 是上游原文可超长）。
- 修复 `scripts/version.mjs` 的入口守卫：Windows 下 `new URL(process.argv[1], 'file:')` 不归一反斜杠，改 `pathToFileURL` 后 `pnpm version:set` 才真正写盘。

### Fixed

- 等级控件只显示补丁里真实配置的档。未配置时选中末尾追加的「未设置」段并给出提示；此前回退到运行时推导档，把内置兜底显示成用户已选。
- README 记录补丁条目必须写在顶层。插件包自带的 `cordis.patch.yml` 用 `insert` 列表，宿主不为它管理 `config` 块，面板写入永远被拒。
- `verify.mjs` 的 `t()` 键收集正则在 `[a-z]+` 上漏掉全部含大写的键，缺键时界面会静默显示键名。
- 技能卡与 README 同步三级链与 profile 落点；新增门禁挡住退役表述。
## [5.1.0] - 2026-10-05

### Breaking

- 配置与 flag 的落点从全局数据根改为 profile 目录（`profiles/<name>/ponytail/`）。升级用户当前档位重置为 `full`。
- 优先级链从四级降为三级 `env > patch > fallback`，`config.json` 层退役。

### Added

- 配置与 flag 的 profile 维度，目录来自宿主 `profileContext.dir`。同机多实例不再共享 `$DSH_HOME/ponytail`。
- `src/ponytail-settings.ts`：settings 通道写入 profile 补丁并带 revision 冲突保护；无 settings 服务时回退读写 profile 内 `config.json`；旧全局 `config.json` 一次性导入后改名。
- `src/ponytail-remote.ts`：`TypertRemoteService` 子类，只读端点 `snapshot()`（当前等级 + 诊断链）。
- 客户端 Remote 贡献声明。此前只读命名空间却从未挂载，网关不会按需开通它，面板因此永久显示「诊断信息不可用」；顺手删掉 40 次轮询。

### Changed

- 配置卡改用官方插件配置组合：两个可持久化字段声明为 `.volatile()`，客户端经 `ctx.configForms.get('ponytail')` 读写。
- `patchMode` 改为实时读取 volatile 引用，不再缓存启动快照。
- 技能启用态的失效触发点改为监听宿主 `loader/volatile-update`。

### Removed

- `src/ponytail-http.ts` 与自制端点、`webServer` 注入。
- `apply()` 里对 `settings.register()` 的调用：dsh-settings 没有这个方法，属于从未生效的死代码。
- 平台位置（`%APPDATA%` / `XDG_CONFIG_HOME` / `~/.config`）兼容读取。

### Fixed

- 技能禁用开关此前改完模型侧目录不收敛。现由 loader 的 volatile 提交事件驱动失效。
- 等级选择器把兜底命中当成更高优先级的配置，按钮永久禁用且提示在说谎。改为只认 env 命中。

## [5.0.0] - 2026-10-04

### Changed

- 版本从 `4.10.0-dsh.12` 切换为独立的标准 SemVer，不再生成 `-dsh.N`。
- README、架构记录与发布流程明确区分本地版本与上游参考版本。
- CI 不再写死行为测试数量。

### Fixed

- 客户端 locale 字典改为 DSH 要求的扁平键，避免界面显示裸 key。

## [4.10.0-dsh.12] - 2026-10-04

### Fixed

- 默认档持久化后 HTTP 诊断仍读旧快照：配置端点改用实时 getter。
- systemPrompt 生产接线绕过 `renderPromptSection`。

## [4.10.0-dsh.11] - 2026-10-04

### Fixed

- **客户端产物内嵌宿侧死代码 `import.meta`**（4.10.0-dsh.10 引入）：零引用却让浏览器解析即 SyntaxError，整个客户端 bundle 加载失败、面板静默消失。删除死行，`verify.mjs` 加反向断言。
- **默认档命令层分裂**：apply 与 UI 面板走 `resolvePriority`（含 patch 层），命令调度器未注入时落到无 patch 层的 `getDefaultMode()`。patch 与 config 不同时，`/ponytail foobar` 把等级切错。三条消费路径统一真源。

### Changed

- `config.json` 读侧收敛单一解析出口。
- HTTP 快照合并为单次求值。
- 技能禁用补文件优先收敛与纯函数判定。

### Removed

- `src/ponytail-runtime.ts`（46 行薄壳）内联进 `ponytail-state.ts`。

## [4.10.0-dsh.10] - 2026-10-04

### Added

- 客户端面板接入官方 `ctx.locale`，36 键双语字典，语言切换即时刷新。
- HTTP 配置端点剥离为独立深工厂，依赖全注入不碰 `ctx`，补上此前 0 覆盖的单测。
- 技能元数据单一真源：`SKILL.md` frontmatter 为唯一真源，删除两处已漂移的硬编码。
- 行为测试 44 → 59 项。

### Changed

- 优先级统一为 `resolvePriority` 唯一真源。**行为变更**：patch 的大小写变体与非法值从「生效」改为「忽略」。
- 配置写盘改为字段级 merge，保留用户手写的未知字段；非法 `defaultMode` 拒绝写盘。
- 修复 `providerInstance` 死变量：UI 改禁用技能后模型侧目录此前不刷新。

### Removed

- 两个孤儿函数与失效类型；HTTP 端点从 `apply()` 剥离。

## [4.10.0-dsh.9] - 2026-10-04

### Removed

- 移除四条多余 UI 落点（设置窗口 Tab、侧边栏按钮、全局浮层、插件条目）。实测确认面板从 0.6 起就正常显示在插件卡片详情，多余落点让同一面板在三处重复出现。
- 卡片配置只以包名注册一个 key，bundle id 那条永不会命中。

### Changed

- 门禁由「断言落点齐全」改为「只允许一条，出现任何其他落点即失败」。

## [4.10.0-dsh.8] - 2026-10-04

### Added

- 两条常驻 UI 落点（侧边栏按钮、全局浮层）。上游参照实现从不把可见性赌在单一页面上。

### Changed

- UI 落点由三条扩为五条，门禁同步扩充。

## [4.10.0-dsh.7] - 2026-10-04

### Added

- 设置窗口一级 Tab 作为保底入口，不经插件管理页。
- 卡片配置双 key 保险：包名与 bundle id 同时注册，只会渲染一份。

### Fixed

- 桌面版设置界面仍无面板。插槽 spec 缺失时回调永不执行且零报错，插件页链路不通时前两条落点同时失效且无任何错误信号。补上不依赖插件管理页的入口。

## [4.10.0-dsh.6] - 2026-10-03

### Added

- 官方插件页通道 `plugins.item`，组件按视图分态。
- 宿侧设置命名空间注册，插件页据此 serve 配置表单。
- UI 落点静态门禁（破坏实测过）。

### Fixed

- **桌面版设置界面无任何 UI**（根因修复）：此前只挂插件卡片详情，而宿侧从未注册命名空间，整块面板静默消失。
- 设置表单与 `config.json` 真源对齐，避免「界面上改了、运行却不生效」。
- `ctx.inject` 缺失时的降级守卫。

## [4.10.0-dsh.5] - 2026-10-03

### Added

- 运行等级四级优先级诊断：新增 `src/ponytail-priority.ts` 纯函数模块，产出诊断链，解决「界面点了等级却没反应」这个长期无诊断手段的痛点。
- 客户端改用 DSH 原生组件族，不再手写内联视觉。
- 删除 `src/client.ts`（与构建脚本重复产出同一产物，必然漂移）。
- 配置与 flag 统一归入 DSH 用户数据根（ADR-0005）。
- 跨平台路径静态门禁、行为测试 33 → 36 项、ADR-0005。

### Changed

- 跨平台一致性修复（根因）：路径一律由 DSH 数据根解析，删除三条平台分支。
- CI 与文档体系校正。

### Migration

- 旧位置的 `config.json` 一次性兼容读取，写入只落新位置。
- 升级后当前等级按默认档重写，与 ADR-0004 迁移同性质；旧 `.ponytail-active` 不做兼容读取。

## [4.10.0-dsh.4] - 2026-10-02

### Added

- 状态存储切面：磁盘与内存两个适配器，共同证明该接缝的价值，消除测试对环境变量的强依赖。
- 提示词模块单一出口 `renderPromptSection`。
- 行为测试 28 → 30 项，隔离 profile 实机全链路实测。

## [4.10.0-dsh.3] - 2026-10-02

### Changed

- 收窄为 DSH 单一宿主：删除 Copilot / Codex / Qoder 三路平台探针与外部宿主分支，flag 固定落在 DSH 配置目录（ADR-0004）。

### Fixed

- `config.json` 默认档被 Cordis 缺省填充 shadow：schema 去掉 `.default('full')` 后缺省才走 `getDefaultMode()`，否则 `/ponytail default <mode>` 持久化的值在下一会话被静默覆盖回 full。

## [4.10.0-dsh.2] - 2026-10-02

### Added

- 状态模块对偶落盘抽象、命令调度器纯内存沙箱单测、npm 标准 `test` 脚本、CI 双轨流水线、行为测试扩充至 26 项。

### Changed

- 命令调度深模块化；插件入口骨架瘦身。
- 发布载荷瘦身：删除与 logo 完全重复的 dark 版，发布包体积降到约五分之一。

### Fixed

- 配置写入补 `try/catch` 守卫，防止磁盘写保护与文件锁异常击穿上层。
- 技能解析补 BOM 与分隔行容错；frontmatter 示例行正则兼容中文引号。
- `AbortSignal` 已 abort 时立即抛 `AbortError`。

## [4.10.0-dsh.1] - 2026-10-01

### Changed

- 架构深化：等级状态收敛为深模块、指令渲染收敛为单一出口、SkillProvider 抽为独立子系统，入口由 533 行降至 272 行。
- `verify.mjs` 的零 tool 静态检查扩为整个 `src/` 目录。

## [4.10.0-dsh.0] - 2026-10-01

### Added

- 完整移植上游 v4.9.0：6 个 Skill、常驻梯子注入（`order: 50`，随档位动态裁剪）、六个 hook 行为的中文复刻。
- `CLAUDE.md` 记忆库、`LICENSE`、`README`、`assets`、`AGENTS.md`。

### Fixed

- `agent/session-start` 是 DSH 不存在的事件，原监听永不被触发，迁为 `agent/created`。
- 未知参数语义对齐上游 else 兜底：静默切到默认等级。

## [4.9.0-dsh.0] - 2026-08-21

### Added

- 首个 DSH 移植版本：单一插件包，`dsh.bundle.patch` 挂载，`PONYTAIL_DEFAULT_MODE` 三级回退（`review` 不可作默认），全部文案中文化，触发词兼容中英文。

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
