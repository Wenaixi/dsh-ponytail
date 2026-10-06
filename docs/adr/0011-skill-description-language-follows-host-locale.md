# 0011 技能描述语言的三态语义与宿主语言跟随

- **状态 (Status)**: 已采纳 (Accepted)
- **日期 (Date)**: 2026-10-06

## 背景与上下文 (Context)

5.2.0 及此前版本把 `skillDescriptionLang` 做成带 Schema 默认值 zh 的 volatile 字段：
未配置时模型目录、斜杠菜单与面板一律显示中文描述。用户提出「是否会根据 DSH 宿主语言配置
进行初始对齐」——核对源码后确认：宿主语言偏好是 `dsh-client-locale` 的 `locale` 命名空间
volatile 字段 `preference`（仅在用户于宿主设置里显式选过语言时落盘），与插件的
`skillDescriptionLang` 是两个完全独立的命名空间，插件从未读取宿主语言。

由此暴露一个设计断层：**默认值 zh 让「未配置」与「显式选了 zh」不可区分**，而两者的语义
应当不同——「显式 zh」是用户的锁定选择；「未配置」应可跟随宿主语言做初始对齐（英文宿主
的用户装完插件第一眼应是英文）。

## 架构决断 (Decision)

1. **`skillDescriptionLang` 改为三态语义，去掉 Schema 默认值**：
   - 显式 `'zh'` / 显式 `'en'`：用户锁定，宿主语言不再影响；
   - 未配置（volatile 引用包 undefined → 运行时 `'auto'`）：语言跟随宿主语言。
   - 去掉默认值的理由与 `defaultMode` 同构：默认值会让「配过」与「没配过」不可区分，
     诊断与面板失去判别力。
2. **对齐源只认 `locale.preference` 的显式选择，且仅 `'en'` 触发对齐**：
   - 浏览器 `navigator.language` 探测值不落盘、宿主侧读不到，架构上不可作为对齐源；
   - 非法/缺失值一律兜底 zh（保持旧默认中文，不破坏中文用户现状）。
3. **对齐解析收敛在 `src/ponytail.ts` 的 `effectiveSkillLang()` 闭包，每次求值现读不缓存**：
   - 读 `settings.describe()` 的 `locale` 命名空间（dsh-settings 的 describe 返回
     descriptors 数组，含 ns/value）；
   - 显式值优先，未配置才查宿主；无 settings 服务（headless/CLI）时 try/catch 回退 zh。
4. **宿主语言运行期变更的收敛点在 `app-boot/config-reload`**：
   - `locale` 条目的 `loader/volatile-update` 只在那条插件自己的 fiber 上广播，
     本插件收不到；宿主每次应用补丁后广播 `app-boot/config-reload`
     （dsh-app-boot/lib/index.js:3494，dsh-settings 自己也靠它重算快照）；
   - 本插件在该事件里调 `providerInstance.invalidate()`，让模型目录与斜杠菜单随宿主语言刷新。
5. **面板语言控件加第三段「跟随宿主（自动）」**：未配置时显示该段并提示当前跟随到的实际语言；
   显式选择写 `set`，选「跟随宿主」写 `unset` 回到未配置。控件遵守 SegmentedControl
   铁律（value 必须在 options 里）。
6. **不新增「auto」持久化值**：未配置 = 字段缺失（unset 即回跟随态），不引入新取值域污染。

## 影响与后果 (Consequences)

- **正面收益**：英文宿主用户装完插件第一眼即为英文；中文宿主用户现状不变（兜底 zh）；
  面板能如实呈现「跟随中」而非把解析结果伪装成用户选择。
- **兼容性**：老用户显式 zh/en 值保留、语义不变；去掉默认值只影响未配置路径，无迁移负担。
- **已知局限（记录在案，不在本次能力内）**：斜杠菜单来源缓存只在
  `agent-preset/selected` / `connection/reset` 时失效（dsh-client-ui-skill/lib/client.js:429-430，
  官方消费方行为），宿主语言切换后菜单可能延迟到下一会话边界；模型目录与面板
  （remote 快照现读）即时生效。

## 被拒绝的方案

- **把默认值留在 zh、新增「auto」取值域**：等于让「未配置」与「显式 zh」依旧不可区分，
  面板只能靠额外状态猜，且把运行时解析态混进持久化取值域。
- **读浏览器 `navigator.language` 做对齐**：探测值不落盘，宿主侧插件进程读不到；
  要做只能把探测值经某个通道写回宿主，为一个初始默认引入跨端写通道，YAGNI 否决。
- **订阅 `locale/change` 事件**：该事件是客户端 LocaleRuntime 在浏览器侧广播的，
  宿主侧插件收不到；`app-boot/config-reload` 是宿主侧现成的文档变更通知，够用。
