# Changelog

所有重要变更记录于此，格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。本地版本与上游参考版本独立维护。

> 当前本地版本：`5.0.0`。上游参考：`DietrichGebert/ponytail 4.10.3`（2026-10-04 核验）。历史 `-dsh.N` 记录仅用于追溯，不再作为现行版本规则。

## [5.0.0] - 2026-10-04

### Changed
- 本地版本从 `4.10.0-dsh.12` 切换为独立的 `5.0.0`，不再随上游版本自动重置或生成 `-dsh.N`。
- README、架构记录和发布流程明确区分本地发行版本与上游参考版本。
- CI 行为测试步骤改为以实际命令输出为准，不再写死历史数量。

### Fixed
- 客户端 locale 字典改为 DSH 要求的扁平键，避免界面显示 `panel.title`、`priority.title` 等裸 key。
- 客户端产物继续禁止 `import.meta` 和 `process.`，避免浏览器导入失败。

## [Unreleased]

### Added
- `src/ponytail-settings.ts`：可持久化配置的读写通道。`createSettingsSink` 经 `ctx.settings.mutate('ponytail', ops, revision)` 写入，由宿主落到 profile 补丁并自带 revision 冲突保护；`createFileSink` 在无 profileContext 的组合（headless / CLI，dsh-base 的 settings 行未装配）回退读写 `config.json`；`migrateLegacyConfig` 把旧 `config.json` 的两个字段一次性导入 profile 补丁并改名旧文件使其幂等。
- `src/ponytail-remote.ts`：`PonytailRemote extends TypertRemoteService`，命名空间 `ponytail`，只暴露只读端点 `snapshot()`（当前生效等级 + 四级优先级诊断链）。宿主网关按服务上的 `typertRemote` 绑定自动发现端点，浏览器侧即 `ctx.remote.ponytail.snapshot()`。

### Changed
- 配置卡改用 DSH 官方插件配置组合：`Config` 的 `defaultMode` 与 `disabledSkills` 声明为 `.volatile()` 字段，宿主 `volatileForm()` 投影成官方表单；客户端经 `ctx.configForms.get('ponytail')` 读写，插槽注册包在 `configForms.whileServed(['ponytail'])` 内。
- `patchMode` 改为实时读取 volatile 引用，不再缓存启动期快照。
- `PonytailConfig` 的两个可持久化字段类型为 `VolatileRef<T>`，新增 `readVolatile()` 兼容「引用 / 裸值 / 未配置」三态。
- 技能启用态的失效触发点从自制 HTTP 端点直调改为监听宿主 `loader/volatile-update`。

### Removed
- 删除 `src/ponytail-http.ts` 与 `/api/plugins/ponytail/config` 端点，以及 `webServer` 注入。
- 删除 `apply()` 里对 `settings.register('ponytail', Config)` 的调用——`@deepseek-ai/dsh-settings@0.2.0-rc.2` 没有 `register` 方法（全文件零次出现），该调用此前被 `typeof` 守卫静默跳过，属于从未生效的死代码。命名空间改由「唯一 profile 条目 + 含 volatile 字段的 Config」自动产生。

### Fixed
- 技能禁用状态此前只存在 `config.json` 且只能由 HTTP 端点修改；迁移后 UI 改开关后模型侧目录不收敛（写入链不经过本插件任何函数）。现由 loader 的 volatile 提交事件驱动失效。
- 客户端配置卡此前自建 `fetch` 状态机（含空配置兜底、加载态、错误态），现完全走官方表单控制器，不发起任何 HTTP 请求。

## [4.10.0-dsh.12] - 2026-10-04

### Fixed
- 修复默认档持久化后 HTTP 诊断仍读取旧 patch/env 快照的问题：配置端点改用实时 getter，GET 与 POST 共享当前优先级事实。
- 修复 systemPrompt 生产接线绕过 `renderPromptSection` 的问题，保留技能禁用配置热收敛。

### Changed
- 新增两项生产接线回归测试，覆盖动态 HTTP handler 与外部 flag 变化；行为测试达到 64 项。
- 延后统一多个 SKILL.md frontmatter 解析器：provider、HTTP 与构建脚本的输入接受范围和 fallback 语义不同，暂不引入共享 seam。

### Migration
- 无配置格式迁移；现有配置继续有效。

## [4.10.0-dsh.11] - 2026-10-04

### Fixed
- **客户端产物内嵌宿侧死代码 `import.meta`（C4 回归）**：`build-client.mjs` 模板残留一行
  `const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')`
  （4.10.0-dsh.10 引入），产物 `lib/client.js` 里零引用却携带 `import.meta`——宿主把 bundle
  原样拼接进 `<script src>` 加载，浏览器解析即 SyntaxError，整个客户端 bundle 加载失败
  （配置面板静默消失）。删除死行；`verify.mjs` 新增反向断言：`lib/client.js` 不得含
  `import.meta` / `process.`（先破坏实测再还原）。
- **默认档命令层分裂（真 bug）**：apply 启动判定与 UI 面板走 `resolvePriority`（含 patch 层），
  而命令调度器未注入 `getDefaultMode` 时落到 `getDefaultMode()`（无 patch 层）。当
  cordis.patch.yml 显式声明 `defaultMode` 且 config.json 缺失/不同时，`/ponytail foobar`
  （上游 else 兜底切默认档）把等级从 patch 档切到 config 档，裸 `/ponytail` 报告档也错误。
  修复：dispatcher 注入实时 `resolvePriority` 闭包（同 apply/UI 同源同刻），
  三条消费路径统一真源。

### Changed
- **config.json 读侧收敛单一解析出口（C2）**：新增私有 `parseConfigObject(raw)` 归一解析
  唯一真源，`readFullConfig` 退化为薄包装；`getDefaultMode`（无 patch 层、无 trim）与
  `writeFullConfig`（保留未知键）语义不动。
- **HTTP 快照合并单求值（C3）**：一次 GET/POST 快照内 `resolvePriority` 双调 + 双读盘
  （最坏 4 次 readFileSync）合并为读一次 configMode → 单次求值，`defaultMode ===
  priority.effective` 由结构保证并以行为测试锁定。
- **技能禁用补文件优先收敛（C1）**：`PonytailState` 新增 `reloadDisabledSkills()`
  （与等级侧 `syncFromFile` 同构，外部手改 config.json 后注入时收敛）；「禁用 ponytail →
  关闭等级」规则提为 `isMainSkillDisabled()` 纯函数，HTTP POST 两分支共用同一守卫。

### Removed
- **`src/ponytail-runtime.ts`（C6）**：46 行薄壳（`resolveStateDir` 只是 `getConfigDir`
  的无谓转发）内联进 `ponytail-state.ts`，净减 1 文件 + 一层间接委托；测试 import 与
  verify 产物清单同步；`.gitignore` 排除 `.local/`（桌面版调试备份不入库）。
- **ADR-0007**：记录命令层默认档并入 resolvePriority 真源（修订 ADR-0006 决策 1）、
  读侧收敛、快照合并、flag 内联、C5 维持否决（宿主 collectCache 已兜底 list 侧）。

### Migration
- 命令层兜底切档语义变更：从「独立于 patch 层」变为「并入 patch 层」——这是修复而非回归
  （分裂本身就是 bug）；无数据丢失，无配置格式变化。


## [4.10.0-dsh.10] - 2026-10-04

### Added
- **客户端面板接入官方 `ctx.locale`（C6）**：新增 `@deepseek-ai/dsh-client-locale` 到 `dsh.client.inject`，面板全部文案经 `ctx.locale.register('ponytail', {zh, en})` + `bind` 双语提供（36 键成对，真源 `locale/*.json`），诊断链 label/problem 在客户端按 level 查字典覆盖（宿侧契约零改动），语言切换即时刷新；**技能说明保持中文不翻译**（用户边界）。`scripts/verify.mjs` 新增 locale 接入反向断言。
- **HTTP 配置端点剥离为独立深工厂（C1）**：新增 `src/ponytail-http.ts` 的 `createConfigHttpEndpoint(deps)`，GET/POST/405、请求体解析、快照组装、技能元数据读取全部内聚，依赖全注入不碰 `ctx`，行为测试新增 5 条端点单测（此前 0 覆盖）。
- **技能元数据单一真源（C2）**：宿侧 `readSkillMeta` 实时读取 `skills/*/SKILL.md` frontmatter 为唯一真源（读不到回退 `FALLBACK_SKILL_META`），客户端构建期提取内嵌；删除 `rawSkillsMeta` / `SKILL_META` 两处硬编码（6/6 技能文案原已漂移）。`verify.mjs` 反向断言锁死描述不回退到硬编码。
- **行为测试 44 → 59 项全绿**：新增 C1 端点 5 条、C2 技能元数据 4 条、C3 写盘 3 条、C4 一致性 3 条。
- **ADR-0006**：记录优先级与配置收敛、HTTP 剥离、元数据真源、客户端 locale 接入全部决策，含 C5 否决理由（官方 `skills/change` 是消费方通知缝，提供者反向 invalidate 会同步递归栈溢出）。

### Changed
- **优先级统一为 `resolvePriority` 唯一真源（C4）**：apply initialMode 与 GET/POST defaultMode 全部消费其 `effective`（此前三处并行实现）。**行为变更声明**：patch 显式值的大小写变体/非法值从「生效（注入垃圾态）」变为「忽略（落合法档）」。
- **配置写盘字段级 merge（C3）**：`writeFullConfig` 保留 `config.json` 中用户手写的未知字段（不再重建为两键对象），defaultMode 非法值拒绝写盘返回 null；`writeDefaultMode` 退化为其薄包装。
- **修复 `providerInstance` 死变量（C1）**：`skills.registerProvider` 工厂现捕获实例到 `providerInstance`，UI 变更后的 `invalidateSkills()` 从空操作恢复真实失效语义（此前 UI 改禁用技能后模型侧目录不刷新）。

### Removed
- **双孤儿函数**：`ponytail-config.ts` 的 `isDeactivationCommand`（`commands` 版唯一实现保留）与 `normalizeConfigMode`（全仓零调用方），以及失效类型 `VALID_MODES` / `ValidMode`。
- **HTTP 端点从 `apply()` 剥离**：`src/ponytail.ts` 410 行 → 约 330 行，回归纯生命周期编排。

### Migration
- 行为变更：曾有非法/大小写 patch 显式值的现有配置在升级后按新语义忽略（落合法档），属有意修复，非数据丢失。

## [4.10.0-dsh.9] - 2026-10-04

### Removed
- **移除 0.7 / 0.8 加入的四条多余 UI 落点**（`settings.section`、`sidebar.footer.action`、`shell.overlay`、`plugins.item`）及其配套组件与 `window.__PONYTAIL_UI__` 自检标记。用户实测确认：配置面板在 0.6 起就已正常显示于「插件列表 → 懒人模式（ponytail）→ 卡片详情」，多余落点反而让同一面板在设置窗口、侧边栏底部、插件页「官方」分组重复出现，属明确的 UI 污染。客户端产物由 15969 字节回落至 11112 字节。
- **卡片配置恢复单 key**：仅以包名 `@wenaixi/dsh-ponytail` 注册。宿主 `listBundles` 的 `name` 即包名（README 与实测双向确认），bundle id 那条 key 永不会命中，属臆想的兼容。

### Changed
- **门禁改为反向断言**：由「断言五条落点齐全」改为「只允许 `plugins.bundle.config` 一条，出现任何其他 `ctx.slots.inject` 即 FAIL」，锁死 UI 落点不被再次扩散。断言总数 34 → 33。

### Fixed
- **`settings.section` 与宿侧 settings 注册的关系澄清**：宿侧 `settings.register("ponytail", Config)` 保留——它让宿主为插件页卡片 serve「实时 Config 表单」，是卡片面板的数据来源；被移除的只是客户端那条多余的设置窗口 Tab。

## [4.10.0-dsh.8] - 2026-10-04

### Added
- **两个常驻 UI 落点（对照参考实现 dsh-context 的策略）**：`sidebar.footer.action`（侧边栏底部入口按钮）+ `shell.overlay`（点击后弹出的全局浮层，内嵌完整配置面板）。dsh-context 共 9 个落点，其中 7 个是常驻 UI 位置、设置相关仅占 2 个——它从不把可见性赌在设置/插件管理页这一条链路上；本插件此前只有设置/插件页落点，是本次连续两轮修复无效的结构性原因。
- **客户端注册自检标记 `window.__PONYTAIL_UI__`**：`slots.inject(key, cb)` 在插槽 spec 不存在时**回调永不执行且零报错**（`dsh-client-ui-renderer` 的 `reconcile()`），静默失败无法观测。现把实际注册成功的落点写入该全局对象，排查时在控制台输入 `__PONYTAIL_UI__` 即可分清「哪些链路通了、哪些没通」。

### Changed
- **UI 落点由三条扩为五条**：常驻 2（侧边栏按钮 / 浮层）+ 设置与插件页 3（`settings.section` / `plugins.item` / `plugins.bundle.config` 双 key）。门禁扩至 34 条并同步断言五个插槽。

## [4.10.0-dsh.7] - 2026-10-04

### Added
- **设置窗口一级 Tab（`settings.section`）**：客户端新增第三条 UI 落点。该插槽由 `@deepseek-ai/dsh-client-ui-settings-general` 声明、官方 agent-preset / models / plugins / account 等插件同款，**不经过插件管理页**，因此是插件页通道不可用时（宿主版本差异、模块时序差异）的保底入口——设置窗口左侧出现「Ponytail 懒人模式」，右侧渲染完整配置面板。
- **卡片配置双 key 保险**：`plugins.bundle.config` 同时以包名 `@wenaixi/dsh-ponytail` 与 bundle id `ponytail` 注册。宿主 `listBundles` 的 `name` 实测为包名，但个别宿主若以 bundle id 为键同样命中；keyed 插槽允许不同 key 并存，容器按 `entryKey` 过滤，**只会渲染一份**，不会出现双面板。
- **门禁扩充至 32 条**：新增「三条 UI 落点插槽齐全」与「双 key 拼写齐全」两条静态断言，并完成破坏实测（移除 `settings.section` 注册即变红，还原后变绿）。

### Fixed
- **桌面版设置界面仍无面板**（0.6 修复不彻底）：0.6 只补了 `plugins.item`，而该插槽与 `plugins.bundle.config` 同属插件管理页链路——两者都由 plugin-manager 注册到 `main` 时经 `children` 表声明；`slots.inject(key, cb)` 在 spec 缺失时**静默 return 且不报错**（`dsh-client-ui-renderer` 的 `reconcile()`），故插件管理页链路一旦不通，前两条落点会同时失效且无任何错误信号。本次补上不依赖 plugin-manager 的 `settings.section` 作为兜底。

### Changed
- **UI 落点策略由「双通道」改为「三通道冗余」**：设置窗口 Tab、插件页条目、卡片详情面板各占一条，任一条链路在特定宿主上不可用都不会导致插件完全无 UI。

## [4.10.0-dsh.6] - 2026-10-03

### Added
- **官方插件页通道 `plugins.item`**：`scripts/build-client.mjs` 新增 `plugins.item` 插槽注册（与官方 shell / agent-loop / web-search / subagent 同款），组件按 `props.view` 分态——`summary` 返回一行文案（卡片描述位），`page` 渲染完整配置面板。
- **宿侧设置命名空间注册**：`src/ponytail.ts` 经 `ctx.inject(['settings'])` 调用 `settings.register('ponytail', Config)`（复用现有 `Config` schema；刻意不写进 `inject` 数组，桌面版未装配该服务时静默降级），插件页据此为 ponytail serve 配置表单。
- **UI 落点静态门禁**：`scripts/verify.mjs` 新增两条断言——客户端必须同时注册 `plugins.item` 与 `plugins.bundle.config`，宿侧必须调用 `settings.register("ponytail", Config)`。已完成破坏实测：删掉 `plugins.item` 注册即变红，还原后变绿。

### Fixed
- **桌面版设置界面无任何 ponytail UI**（根因修复，非渲染问题）：此前客户端只挂 `plugins.bundle.config`（已安装包卡片详情），而该区域仅在宿主为该包 serve 配置表单时渲染；宿侧从未注册 settings 命名空间，整块面板因此静默消失。经与 dsh-context（宿侧 `settings.register(NS, Schema)`）对照取证定位。
- **设置表单与 config.json 的真源对齐**：宿侧注册后于启动时把表单写入的默认档对齐回 `config.json`，保持 ADR-0005 单一真源，避免「界面上改了、运行却不生效」的静默失效。`ponytail:` 注释已标注天花板：仅启动时对齐一次，无实时订阅。
- **`ctx.inject` 缺失时的降级守卫**：行为测试的精简 ctx 未提供 `ctx.inject`，注册段抛 `TypeError`。守卫与既有 `if ((ctx as any).webServer)` 同款，`ctx.inject` 缺失时整段跳过，不阻断插件其余能力。

### Changed
- **`readRawConfigMode` 提为 `apply()` 内共享函数**：原为 Web 端处理器内的局部函数，提升后由设置通道对齐与优先级诊断链共用一份（消除重复实现）。

## [4.10.0-dsh.5] - 2026-10-03

### Added
- **运行等级四级优先级诊断**：新增 `src/ponytail-priority.ts` 深模块，`resolvePriority({ envRaw, patchMode, configMode })` 为纯函数零 I/O，产出恒 4 项诊断链（env > patch > config > fallback），每项含 label / location / value / hit / shadowed / problem；`GET` 与 `POST /api/plugins/ponytail/config` 均返回 `priority` 字段，`readRawConfigMode()` 区分「字段缺失」与「文件损坏」。解决「界面点了等级却没反应」这一长期无诊断手段的痛点。
- **客户端改用 DSH 原生组件族**：`scripts/build-client.mjs` 改用 `@deepseek-ai/dsh-client-ui-primitives` 的 `SegmentedControl`（等级）、`Switch`（技能开关）、`StateDot` + `Tag`（诊断链状态）、`Button`（恢复默认），不再手写内联视觉；`package.json` 的 `dsh.client.inject` 增加 primitives，peerDependencies 补 `react`。
- **产物单一来源收敛**：删除 `src/client.ts`（与 `scripts/build-client.mjs` 重复产出 `lib/client.js`，tsc 产物被覆盖后必然漂移）；`scripts/verify.mjs` 的平台路径门禁改为扫描 `scripts/build-client.mjs` 与 `lib/client.js`。
- **行为测试扩充 36 → 44 项全绿**：新增 8 项 `resolvePriority` 覆盖全空、各级命中、非法值、标签顺序。
- **统一包描述与仓库简介**：`package.json` 的 `description` 与 GitHub 仓库简介改为「DietrichGebert/ponytail 的 DSH 完整移植：常驻懒人 senior 模式与七阶梯子（YAGNI 到最小实现），6 个中文原生技能（本体、评审、审计、债务、收益、帮助），零 tool 注册」；`locale/en.json` 与 `locale/zh.json` 同步为对应中英文长描述。
- **补齐 DSH 卡片元信息契约**：`package.json` 的 `exports` 新增 `./package.json` 与 `./locale/*.json` 子路径白名单，`files` 收录 `locale/` 与 `assets/icon.png`，manifest 增加 `icon` 字段；新增 `locale/en.json` 与 `locale/zh.json` 双语文案，以及 227x256 的 `assets/icon.png`（28 KB，满足 DSH 256 KiB 图标上限）。修复 DSH 插件列表中本插件只显示包名、无标题无描述无图标的问题。
- **配置与 flag 统一归入 DSH 用户数据根（ADR-0005）**：新增 `resolveDshHome()` 与 `getLegacyConfigDir()` / `getLegacyConfigPath()` / `readConfigFileText()`，`config.json` 与 `.ponytail-active` 统一落位于 `$DSH_HOME/ponytail`（默认 `~/.dsh/ponytail`），与 DSH 官方 `@deepseek-ai/dsh-home-paths` 的「所有用户数据收敛于单一根目录」契约一致。
- **跨平台路径静态门禁**：`scripts/verify.mjs` 新增 `no platform-specific path literals` 断言，扫描 `src/` 与客户端构建期副本，禁止出现 `%APPDATA%` / `XDG_CONFIG_HOME` / `process.platform` 等平台特定字面量（仅豁免旧位置兼容读取分支）。
- **行为测试扩充 33 → 36 项全绿**：新增 DSH 数据根优先级与 `~` 展开断言、配置目录落点断言、旧位置兼容读取断言。
- **架构决策记录 `docs/adr/0005-config-under-dsh-home.md`**：记录迁移决策、`dsh-home-paths` 静态 import 会崩的实测证据、动态预热导致行为漂移的否决理由与旧位置兼容策略。

### Changed
- **CI/CD 流水线校正**：`ci.yml` 与 `publish.yml` 的用例数标注由 26 更新为 44；步骤名去除歧义表述与 emoji；GitHub Release 说明补充上游定位。
- **文档体系校正**：`CONTEXT.md` 修正不变性列表的重复编号（两个「5.」），补 `ponytail-priority.ts` 与双面插件、展示元信息契约等缺失术语与接缝表条目，新增 3.1 优先级诊断链契约；`README.md` 补充界面配置面板说明、Schema 缺省 shadow 的坑、旧位置迁移说明、发布铁律与客户端产物单一来源纪律；`AGENTS.md` 保持与上游同步。
- **跨平台一致性修复**（根因修复）：`src/ponytail-config.ts` 的 `getConfigDir()` 删除 `XDG_CONFIG_HOME` / `APPDATA` / `process.platform === 'win32'` 三条平台分支，改为 `join(resolveDshHome(), 'ponytail')`，路径分隔符一律由 `node:path` 生成；`resolveDshHome()` 逐行复刻官方 `resolveDshHome` 语义（explicit > `$DSH_HOME`（空白视为未设置）> `~/.dsh`），不引入任何新依赖。
- **Web GUI 面板文案中性化**：客户端构建期模板中写死的 `%APPDATA%\\ponytail\\config.json` 改为「DSH 数据目录下的 ponytail/config.json」，跨平台均准确。
- **文档同步**：README 三处路径表述、`skills/ponytail-help/SKILL.md` 配置文件说明改为 `$DSH_HOME/ponytail`；`docs/adr/0004` 追加修订注记指向 ADR-0005。

### Migration
- 升级用户：`defaultMode` 与 `disabledSkills` 通过旧位置（`%APPDATA%\\ponytail` / `~/.config/ponytail`）一次性兼容读取保住，不静默丢失；写入只落新位置，旧目录不删不改。
- 已知妥协：会话启动对齐语义下，升级后当前运行等级会按默认档重写（与 ADR-0004 迁移时同性质），旧位置的 `.ponytail-active` 不做兼容读取（避免旧 flag 意外复活）。

## [4.10.0-dsh.4] - 2026-10-02

### Added
- **状态存储切面（PonytailStorage）**：为 `src/ponytail-state.ts` 的 `createPonytailState` 引入可选 `storage` 契约，生产默认使用 `ponytail-runtime.ts` 的 DSH 配置目录磁盘持久化，单测中可注入纯内存适配器，由真实磁盘与内存存储两个适配器共同证明切面价值（Two adapters justify the seam），消除测试对全局 `XDG_CONFIG_HOME` 环境变量的强依赖。
- **提示词模块高阶深出口（renderPromptSection）**：`src/ponytail-instructions.ts` 暴露单一高阶出口 `renderPromptSection(skillDir, state): string`，封装状态外部同步（`syncFromFile`）、空值与 `off` 关闭态守卫、按需直读模板（遵循 ADR-0003 无状态按需直读原则）与保底降级全链路；`src/ponytail.ts` 的 `systemPrompt.section` 回调精简收敛为单行。
- **行为测试扩充 28 → 30 项全绿**：新增针对 `PonytailStorage` 纯内存存储适配器隔离运行与 `renderPromptSection` 全链路状态装配的两项端到端单测。
- **DSH 真实实例全功能链路深度实测**：在独立的 `ponytail-verify` 验证 profile 下成功完成实机实测，证明 `/ponytail` 状态汇报、`/ponytail default lite` 物理写盘持久化、跨会话启动生命周期对齐与 flag 管理全部 100% 吻合上游契约。

### Changed
- **命令语法解析局部性收敛**：`isDeactivationCommand` 文本判定与标点清洗原生内聚归入 `src/ponytail-commands.ts`，全句失活词（`stop ponytail`、`normal mode`、`退出 ponytail`、`正常模式`）与尾部标点符号清洗彻底闭环在调度管线内部，提升语法解析局部性（Locality），`src/ponytail-config.ts` 聚焦于宿主环境与配置持久化。

## [4.10.0-dsh.3] - 2026-10-02

### Changed
- **收窄为 DSH 单一宿主运行时**：`src/ponytail-runtime.ts` 删除 Copilot / Codex / Qoder 三路动态平台探针与 `resolveStateDir()` 的外部宿主分支，flag 文件（`.ponytail-active`）固定持久化于 DSH 配置目录（`$XDG_CONFIG_HOME/ponytail` / `%APPDATA%\ponytail` / `~/.config/ponytail`），与 `config.json` 同源；`src/ponytail-state.ts` 移除 Copilot 文件缺失豁免，flag 缺失即关闭；`src/ponytail-config.ts` 删除 `getClaudeDir()`。
- **文档与元数据同步**：新增 `docs/adr/0004-dsh-single-host-runtime.md` 并给 `docs/adr/0001` 追加修订注记；README 移除四路 flag 兼容描述；`skills/ponytail-help/SKILL.md` 删除 Codex / Claude Code / OpenCode 触发形式与 Claude Code 专属更新段落；CONTEXT.md / CLAUDE.md 同步；`package.json` keywords 移除 `claude-code`。

### Fixed
- **config.json 默认档被 Cordis 缺省填充 shadow**：`Config` schema 的 `defaultMode` 移除 `.default('full')`——Cordis 校验会把 schema 缺省 fill 成显式配置，导致 `%APPDATA%\ponytail\config.json`（或 `~/.config/ponytail/config.json`）的 `defaultMode` 档永远不可达，`/ponytail default <mode>` 持久化的默认在下一会话被静默覆盖回 full。移除后缺省走 `getDefaultMode()`（env > config 文件 > full），与上游 `ponytail-config.js` 语义逐行一致。
- **行为测试补充回归 27 → 28 项**：新增「Config schema: defaultMode 无 Schema 默认值（config.json 默认档可达）」断言，锁定缺省为 undefined 且 `providerName` 默认值保留。

## [4.10.0-dsh.2] - 2026-10-02

### Added
- **状态模块对偶落盘抽象**：`src/ponytail-state.ts` 新增 `syncToFile(): void` 显式落盘方法，与 `syncFromFile()` 形成完全对称的对偶接口（Disk ↔ Memory），主入口 `agent/created` 监听器改用显式 `state.syncToFile()` 替代借用 setter 副作用的隐式刷新。
- **命令调度器纯内存沙箱单测**：`scripts/behavior.test.mjs` 补齐针对 `createCommandDispatcher` 处理 `/ponytail default <mode>` 的两项纯内存沙箱测试（合法模式注入写入、非法模式拦截保护），消除单测写穿磁盘副作用，全量行为测试扩充至 26 项全绿。
- **npm 标准测试脚本**：`package.json` 补全缺失的 `"test": "node scripts/behavior.test.mjs"` 标准脚本，并在 `prepublishOnly` 挂载 `npm test` 发布前守卫。
- **CI/CD 双轨自动化流水线**：`.github/workflows/ci.yml` 扩展 `tags: ["v*"]` 触发器，确保代码 push 与 tag 推送均触发全套测试四件套；`.github/workflows/publish.yml` 补齐 `pnpm typecheck` 并对齐门禁步骤，实现 tag 推送时全套测试门禁 100% 先验通过才触发额外发版。
- **高杠杆行为测试套件扩充**：`scripts/behavior.test.mjs` 新增 14 项行为测试（覆盖多 block 文本清洗提取、多 message 展开合并、切档与失活状态突变、裸指令防误切安全守卫、嵌套 block 消息指令识别、示例行中文标点裁剪、无 SKILL.md 失败面收敛等）。

### Changed
- **命令调度深模块化**：在 `src/ponytail-commands.ts` 实现 `createCommandDispatcher`，将消息文本展开提取（`extractTextFromContent` 与 `extractText`）、指令语法解析、状态机流转（`state.set`）、持久化配置写入（`writeDefaultMode`）与宿主日志格式化整体封装为深模块；消除此前 `CommandParseResult` 导出的 6 个松散布尔/可选字段在外部引起的时序耦合，内部锁死 `reportOnly` 优先分支，彻底杜绝裸指令误切。
- **插件入口骨架瘦身**：`src/ponytail.ts` 由 272 行精简至 221 行（净减 51 行脆弱级联胶水），`agent/pre-step` 与 `session/event` 简化为单行委托调用，入口彻底纯化为声明式插件生命周期装配线。
- **状态接口单一关闭契约**：`state.set('off')` 与 `set(null)` 收敛为同一关闭语义（`set` 边界归一 off→null），`agent/created` 的 off→null 镜像删除；消除「无 flag」与「flag 内容 off」两种关闭形态的契约漂移。
- **发布载荷瘦身**：删除与 logo.png MD5 全同的 `assets/logo-dark.png`（676KB×2 → 单源），README dark srcset 收为单一 `<img>`；零引用上游市场物料移出 `package.json` 的 `files` 白名单，发布包体积从约 1.68MB 骤降至约 0.35MB。
- **架构决策自决与驳回**：正式驳回 Candidate 2（合并 state 与 runtime：破坏上游 1:1 逐行移植锚点与产物守卫，净收益为负）与 Candidate 3（合并 skill 存储与 instructions 渲染：同步高频渲染与异步 Cordis 服务范式正交，强行捏合制造上帝类，违背 YAGNI）。

### Fixed
- **配置写入契约闭环**：`src/ponytail-config.ts` 的 `writeDefaultMode` 底层写操作补充顶层 `try/catch` 守卫，遇到磁盘写保护、EACCES 权限受限或 Windows EBUSY 文件锁等底层 I/O 异常时优雅回退 `null`，彻底闭合 `RuntimeMode | null` 类型契约，防止异常击穿上层。
- **静态门禁产物断言补齐**：`scripts/verify.mjs` 产物检查清单补全遗漏的 `lib/ponytail-commands.js` 与 `lib/ponytail-state.js`，实现全量 7 个编译模块 100% 静态断言覆盖。
- **技能解析极端格式容错**：`src/ponytail-skills.ts` 的 Frontmatter 解析状态机补充 UTF-8 BOM（`\uFEFF`）清洗与分隔行 `trimEnd()` 容错，彻底兼容 Windows 编辑器特殊换行与尾部空白。
- **AbortSignal 迅捷响应契约**：`src/ponytail-skills.ts` 的 `list()` 遍历循环首行补位 `options.signal?.throwIfAborted()`，并在 `parseSkillFile` 优先判定 `signal?.aborted`，严格履行 WHATWG / DSH 规范的 `settle promptly` 契约。
- **技能路径安全解析与调试支持**：`src/ponytail.ts` 的 `resolveDefaultSkillDir` 改用标准 ESM 原生 `new URL('../skills', import.meta.url)`；技能扫描放宽 `!entry.isDirectory() && !entry.isSymbolicLink()`，支持软链接技能目录本地调试；`get()` 增强对 `candidate.locator` 的类型保护与 `dirname(targetPath)` 兜底。
- **示例行裁剪契约找回**：`filterSkillBodyForMode` 示例行正则兼容中文引号/冒号（原上游 ASCII 引号形态在中文化正文下永久失配，lite/full/ultra 三档示例区此前完全相同）。
- **list() 失败面收敛**：删除 `stat` 预检，缺失 SKILL.md 与解析失败汇入同一条 warn+跳过路径（`readFile` 本身即可区分）。
- **监听防御对称**：`agent/pre-step` 防御 catch 补 `warn`，与 `session/event` 失败可见性对齐。

### Removed
- **冗余死代码清理**：`src/ponytail-skills.ts` 的 `list()` 解构精简为 `const { data } = parsed`，彻底消除未用变量与 `void body` 压制代码。

## [4.10.0-dsh.1] - 2026-10-01

### Changed
- 架构深化（6 候选核实后自决 4 实施 2 否决）：
  - 等级状态收敛为深模块 `src/ponytail-state.ts`（`createPonytailState`：`get()/set(mode)/syncFromFile()` 三方法，闭包实例随 HMR 重建）；`ponytail.ts` 的 `currentMode` 散落读写（apply 启动、section text 漂移修正、handlePromptText 四处双写、agent/created 镜像）全部收口——`set()` 内存赢原子落盘、`syncFromFile()` 文件赢纠偏（行为与 4.10.0-dsh.0 逐行等价）
  - 指令渲染收敛为深模块 `render(skillDir, mode)`（`src/ponytail-instructions.ts`）：`systemPrompt` section 回调只留 off 短路 + 一次调用，review 短路指针 + 裁剪 + 失败回退收进模块内，对齐上游 `getPonytailInstructions(mode)` 单一出口形态（行为无可观察变更）
  - 抽取 SkillProvider 子系统为 `src/ponytail-skills.ts`（frontmatter 解析 + 目录扫描 + `PonytailProvider.list/get`，DSH 专属层）；`Config` 接口迁 `src/ponytail-config.ts` 为 `PonytailConfig` 共享类型（entry 侧 `export type Config = PonytailConfig` 别名），消除模块循环依赖；不发明工厂——直接导出同名类，注册保持一行 `new PonytailProvider(ctx, control, { providerName, skillDir })`；`src/ponytail.ts` 由 533 行降至 272 行，只留生命周期与监听器（行为无可观察变更）
  - frontmatter 读取瘦身：`stringField/optionalString/optionalMetadata` 折叠为 `readString/readObject/readMetadata`（调用点零改动，净减行数）
  - `apply` 删不可达死代码 `?? null`（分支守卫已排除 undefined）；`?? 'full'` 保留并改为 `DEFAULT_MODE` 常量（DSH 测试路径直接 `apply(ctx)` 真实依赖该兜底）
  - `PONYTAIL_DEFAULT_MODE` env 非法值由静默回退改为 `ctx.logger.warn`（DSH 差分，不改变回退语义，上游仍静默）；config 文件非法值保持静默（与上游一致）
- `scripts/verify.mjs` 静态检查（不注册 tool）由单文件 `src/ponytail.ts` 扩为整个 `src/` 目录扫描（新模块 `ponytail-state.ts` 纳入覆盖）

### Added
- `scripts/behavior.test.mjs` 新增 2 例：`/ponytail default lite` 持久化、`/ponytail default foobar` 非法默认不切换（instruction 解析用例 6 → 8，总数 9 → 11）

### Cleaned
- `src/ponytail.ts` 由 563 行减至 ~533 行；`handlePromptText` 四处 `setMode/clearMode` 成对 try/catch 由 `state.set()` 原子化吸收

## [4.10.0-dsh.0] - 2026-10-01

### Fixed
- `agent/session-start` 死监听迁移为 `agent/created`：`payload.source` 为 `startup`/`resume` 时对齐 flag 文件（`off` 清空、其余 `setMode(currentMode)`），`clear`/`compact` 不动作——DSH 官方事件模型不存在 `session-start`，原监听永不被触发
- 对齐官方 defensive-patterns：`agent/created` 与 `session/event` 监听整体 `try/catch`，坏订阅者不再断链
- `SkillProvider.list()`/`get()` 尊重 `options.signal`：已 abort 时立即抛 `AbortError` 快速 settle（放弃对 fs 调用的 signal 透传）
- `SkillProvider.list()` ENOENT/ENOTDIR 由记 `warn` 返回 `[]` 改为显式 `{ candidates: [], complete: false }`（显式「发现未完成、不可缓存」）与警告并行
- `scripts/verify.mjs` description 长度断言改用 `yaml.parse` 按 YAML 折叠块真实语义计算并输出真实长度；实测六个技能均 ≤500（262/162/165/161/104/165），无需压缩

### Changed
- 版本重置：与上游 v4.10.0 对齐由 `4.9.0-dsh.5` 重置为 `4.10.0-dsh.0`（`pnpm run bump:dsh -- 4.10.0`）
- peer/devDeps 对齐 DSH 0.2.0-rc.2 运行时：`@deepseek-ai/cordis ^4.0.4`、`@deepseek-ai/dsh-skill >=0.1.0-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0`、`@deepseek-ai/schemastery ^3.18.4`
- 指令解析核心由 `handlePromptText` 抽取为纯函数 `parsePonytailCommand`（新增 `src/ponytail-commands.ts`），行为等价，可脱离插件单测；`@`/`$` 前缀与 `/ponytail:ponytail`/`/ponytail:ponytail-review` 前缀形式对齐上游 4.10.0 mode-tracker
- **未知参数语义对齐上游 else 兜底**：`/ponytail <unknown>` 由 `warn` 不切换（4.9.0-dsh.5 引入的 DSH 差分，上游无此分支）改回静默切到默认等级——与上游 mode-tracker 逐分支一致（含默认 `off` 时落入关闭分支）

### Added
- `scripts/behavior.test.mjs` 最小行为测试（node 内置 test runner）：指令解析 6 例 + 技能裁剪 2 例 + abort 立即 settle 1 例，9/9 通过
- `scripts/verify.mjs` 新增六个 SKILL.md `description` ≤500 静态断言（官方 `catalogDescriptionMaxLength` 默认截断线，防回归）

### Cleaned
- 删除无消费方的 `Config.hideStatus`/`Config.quietStartup` 配置项与 `getHideStatus`/`getQuietStartup`/`getPonytailInstructions`/`writeHookOutput`/`getStatePath` 死代码；删除 `normalizePersistedMode` 孤儿导出（README 与 CHANGELOG 无对应表述，无需同步清理）

## [4.9.0-dsh.5] - 2026-08-22

### Fixed
- `isDeactivationCommand` 去除正则重复 `\s`，保持 spec `.!?。！？` + 空白
- `ponytail-runtime` 平台识别由模块级常量改为函数 `isCopilot()/isCodex()/isQoder()`，修复同进程 env 变更后路径漂移
- `/ponytail <unknown>` 未知参数由静默切默认改为 `warn` 不切换
- `extractText` 双路径提取收敛为 `extractTextFromContent` 复用，消除 `agent/pre-step` 与 `session/event` 重复分支
- `scripts/verify.mjs` 不注册 tool 检查由 `|| / &&` 误优先级改为单正则 `\btools\s*\.\s*register\b|\bdefineTool\b`
- `publish.yml` 幂等：`VERSION` 检查提到 `if/else` 前共享，`workflow_dispatch` 计入 `if`，`Create Release` 受 `skipped` 守卫

### Changed
- `CLAUDE.md` Flag 描述由“三分支”更正为“四路”；验证命令 `--filter` 补 `scope`

## [4.9.0-dsh.4] - 2026-08-22

### Changed
- `CLAUDE.md` 改为本地记忆，不再入仓：加入 `.gitignore`，历史提交中移除该文件，本次构建产物与 `CHANGELOG`/`README` 同步到新版本
- README 安装示例移除括号补充说明，保持示例纯净

## [4.9.0-dsh.3] - 2026-08-22

### Fixed
- `Config` 声明顺序修正为 `interface` 在前、`Schema` 在后，符合 `references/config.md` 的 Schemastery 规范写法（此前 `const` 在前会导致类型声明顺序与上游 `dsh-superpower` 不一致）
- `isDeactivationCommand` 补全中文全句匹配 `退出 ponytail` / `正常模式`，并兼容中文标点 `。！？`

## [4.9.0-dsh.2] - 2026-08-22

### Changed
- README 去版本化：徽章与正文不再写死 `4.9.0-dsh.x`，默认装 `latest`；`logo-dark` 同步为新 logo 相对路径

## [4.9.0-dsh.1] - 2026-08-22

### Changed
- 替换 `assets/logo.png` 为用户指定新 Logo（692KB），原文件已移除；README 徽章同步至 `4.9.0-dsh.1`

## [4.9.0-dsh.0] - 2026-08-21

### Added
- 完整移植上游 v4.9.0：6 个 Skill（`ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` / `ponytail-gain` / `ponytail-help`）
- Always-on 梯子注入（`systemPrompt` section, `order: 50`），随 `lite/full/ultra/off/review` 动态裁剪
- 复刻 hooks 行为：`activate` / `mode-tracker` / `subagent` / `config` / `instructions` / `runtime`
- `PONYTAIL_DEFAULT_MODE` env > cordis 配置 > 配置文件 > `full` 三级回退，`review` 不可作默认，BOM 处理、`isShellSafe`、`isDeactivationCommand` 全量对齐
- 中文化：6 个 Skill 的 `description` 与正文、fallback 指令、hook 日志、systemPrompt 注入文本全部中文，触发词兼容中英文
- `CLAUDE.md` 核心记忆库、`LICENSE`（MIT）、`README.md`、`CHANGELOG.md`、`assets/`、`AGENTS.md`

### Changed
- DSH 形态：单一插件包 `@wenaixi/dsh-ponytail`，`dsh.bundle.patch = ./cordis.patch.yml`，包名引用挂载
- 注入文本中文化：`PONYTAIL 已激活 — 等级：…`，`hook` 日志全中文
- 版本统一带 `-dsh.N` 后缀，初始 `4.9.0-dsh.0`

### Fixed
- `initialMode` 优先级修正为 `env > cordis 显式 config > 文件 > full`，与上游语义一致

### Notes
- 不注册 tool（不在 `ctx.tools` 注册任何占位），`scripts/verify.mjs` 校验
- 构建：`pnpm build` (`tsc -p tsconfig.build.json`)，`pnpm typecheck`，`pnpm verify`

[Unreleased]: https://github.com/Wenaixi/dsh-ponytail/compare/v5.0.0...HEAD
[5.0.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v5.0.0
[4.10.0-dsh.2]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.1...v4.10.0-dsh.2
[4.10.0-dsh.1]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.0...v4.10.0-dsh.1
[4.10.0-dsh.0]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.5...v4.10.0-dsh.0
[4.9.0-dsh.5]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.4...v4.9.0-dsh.5
[4.9.0-dsh.4]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.3...v4.9.0-dsh.4
[4.9.0-dsh.3]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.2...v4.9.0-dsh.3
[4.9.0-dsh.2]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.1...v4.9.0-dsh.2
[4.9.0-dsh.1]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.9.0-dsh.0...v4.9.0-dsh.1
[4.9.0-dsh.0]: https://github.com/Wenaixi/dsh-ponytail/releases/tag/v4.9.0-dsh.0

[4.10.0-dsh.4]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.3...v4.10.0-dsh.4
[4.10.0-dsh.5]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.4...v4.10.0-dsh.5
[4.10.0-dsh.6]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.5...v4.10.0-dsh.6
[4.10.0-dsh.7]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.6...v4.10.0-dsh.7
[4.10.0-dsh.8]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.7...v4.10.0-dsh.8
[4.10.0-dsh.9]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.8...v4.10.0-dsh.9
[4.10.0-dsh.10]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.9...v4.10.0-dsh.10
[4.10.0-dsh.11]: https://github.com/Wenaixi/dsh-ponytail/compare/v4.10.0-dsh.10...v4.10.0-dsh.11
