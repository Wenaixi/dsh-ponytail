# 6. 优先级与配置收敛，客户端接入官方 locale

- **状态 (Status)**: 已采纳 (Accepted)，优先级链由 [ADR-0009](0009-profile-scoped-config-and-flag.md) 降为三级
- **日期 (Date)**: 2026-10-04
- **决策者 (Deciders)**: Ponytail 架构小组

## 背景与上下文 (Context)

一次架构深挖（improve-codebase-architecture）发现五处结构性摩擦，其中两处是实锤缺陷：

1. **优先级判定三处并行**：apply() 的 initialMode 分支、resolvePriority() 的诊断链、getDefaultMode() 的
   env>file>full 各自实现同一语义，靠注释约定「逐行一致」，没有机械断言。
2. **patch 未归一注入垃圾态（真 bug）**：apply 把 cordis patch 的 defaultMode **原样**交给 state.set()
   （state.set 只做 off→null，不校验），当值为 `LITE` / `review` / `bogus` 时内存态与 flag 文件同时
   被写成垃圾字符串；resolvePriority 的 patch 级却有 normalizeMode 校验。
3. **HTTP 端点污染 apply()**：410 行的入口里塞着 140 行端点逻辑（GET/POST/405、请求体解析、技能元数据
   硬编码），且 `providerInstance` 声明后从不赋值——`invalidateSkills()` 恒为空操作，UI 改禁用技能后
   模型侧目录不刷新（静默失效）。
4. **技能元数据三处漂移**：src 的 rawSkillsMeta、build-client.mjs 的 SKILL_META、skills/*/SKILL.md
   frontmatter 三份文案两两不一致（6/6 技能全部漂移）。
5. **客户端面板全中文硬编码**：英文界面下整个配置面板是中文；官方 @deepseek-ai/dsh-client-locale
   提供 ctx.locale（register/bind/subscribe），宿主早已装配，面板却未接入。

## 架构决断 (Decision)

1. **优先级唯一真源**：apply 的启动判定与 UI 诊断链一律走 resolvePriority().effective；
   getDefaultMode 保留为无 patch 层的简化封装（命令模块的 fallback 语义不变）。
   > **ADR-0007 修订**：命令模块 fallback 语义并入 resolvePriority 真源（修复 patch 层下
   > 命令切档分裂），getDefaultMode 仅保留为无注入场景的兼容兜底。
   **行为变更声明**：patch 显式值的大小写变体/非法值从「生效（注入垃圾态）」变为「忽略（落合法档）」。
2. **HTTP 端点剥为独立深工厂**：新增 src/ponytail-http.ts 的 createConfigHttpEndpoint(deps)，
   依赖全注入、不碰 ctx，可用假 req/res 单测；apply 只留接线。同时修复 providerInstance 捕获。
3. **技能元数据单一真源**：SKILL.md frontmatter 为唯一真源。宿侧 readSkillMeta 实时读取（读不到回退
   FALLBACK_SKILL_META），客户端构建期提取内嵌；verify 反向断言锁死两处不得再出现硬编码描述。
4. **配置写盘字段级 merge**：writeFullConfig 不再重建为两键对象，保留 config.json 中用户手写的未知字段；
   defaultMode 非法值拒绝写盘（返回 null）。writeDefaultMode 退化为其薄包装。
5. **客户端接入官方 locale**：ctx.locale.register('ponytail', {zh, en}) + bind，全部面板文案走 t()；
   诊断链 label/problem 按 level 在客户端覆盖（宿侧契约零改动）；**技能说明保持中文不翻译**（用户边界，
   技能解释面向中文母语使用者）。
6. **C5 观察钩子否决**：官方 skills/change 是给消费方（host UI/agent-loop）的通知缝，提供者不应在其内
   反向调 control.invalidate()（invalidateCache→notifyChange 会再次 emit，同步广播无防重入守卫，直接栈溢出）；
   本插件技能目录也不在任何 filesystem provider 的观察 roots 内。正确闭环是 UI 变更点直调 invalidate。

## 影响与后果 (Consequences)

- **正面收益**：优先级语义单点可见且可测；apply() 回归纯生命周期编排（410 → 约 330 行）；HTTP 端点
  从 0 测试变为 5 条单测；技能元数据漂移从结构上消灭；面板支持中英双语且跟随宿主语言切换即时刷新；
  patch 非法值不再污染 flag 文件。
- **妥协权衡**：面板技能描述从一行摘要变为 frontmatter 全文案（rowDesc 加单行省略裁剪）；
  客户端产物约 +2.5KB（字典内嵌）；resolvePriority 每次调用重读 config.json（读盘 0.22ms 量级，可忽略）。
- **兼容性**：Config schema、cordis.patch.yml、UI 落点契约、settings.register 均未变；旧位置兼容读取未动（5.x 清理）。

## 验证证据 (Verification)

- `node scripts/behavior.test.mjs`：44 → 60 项全绿（新增 C1 端点 5 条、C2 元数据 4 条、C3 写盘 3 条、C4 一致性 3 条）。
- `node scripts/verify.mjs`：33 → 36 条断言 ALL PASS（新增技能元数据单一真源、locale 接入反向断言、
  lib/ponytail-http.js 产物登记）。
- `pnpm typecheck` / `pnpm build` 通过；lib/client.js 无游离中文文案，无 Node API 残留。

## 相关决策

- 修订 ADR-0003（无状态直读）：frontmatter 读取仍是按需直读，未引入缓存，C5 否决即据此精神。
- 补充 ADR-0004/0005：数据根与单一宿主语义不变。
