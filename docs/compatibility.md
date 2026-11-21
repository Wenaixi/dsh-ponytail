# 宿主版本兼容性（Compatibility）

## 一、本插件依赖的宿主契约

| 契约 | 由谁提供 | 用途 | 风险点 |
| --- | --- | --- | --- |
| `skills.registerProvider(factory)` | `@deepseek-ai/dsh-skill` | 注册技能提供者，返回 cordis effect disposer | **disposer 必须持有**，见下文 |
| `ctx.skills` 类型 | `@deepseek-ai/dsh-skill` 的 `declare module` | `Context` 上已声明 `skills: SkillRegistry` | 不需要也不应该写内联类型断言 |
| `systemPrompt.section({name, order, text})` | `@deepseek-ai/dsh-system-prompt` | 注入提示词段落，返回 disposer | section 名在同层必须唯一 |
| `skills/change` 事件 | 宿主 | 技能目录变更通知（emit 模式） | **不可在回调里反向调用 `control.invalidate()`**，会同步重入导致栈溢出 |
| `loader/volatile-update` | `@deepseek-ai/cordis-plugin-loader` | 宿主把补丁新值就地写进进程引用后广播 | 不处理会导致 UI 改开关对模型侧无效 |

## 二、disposer 必须被持有（重要）

`registerProvider` 返回的是 cordis effect disposer。语义上「随 fiber 卸载自动注销」，但**HMR 重挂同一 fiber 期间**旧 provider 会残留到 fiber 销毁为止，导致同一技能目录被多份快照重复服务（技能列表出现重复项）。

正确写法：

```ts
ctx.effect(() => {
  const disposeProvider = ctx.skills.registerProvider((control) => {
    providerInstance = new PonytailProvider(ctx, control, { /* ... */ })
    return providerInstance
  })
  return () => {
    providerInstance = null
    disposeProvider()
  }
})
```

`superpower` 用的是同一形态，可作为参照。

## 三、测试桩的 `effect` 不能是空实现

cordis 的 `ctx.effect(fn)` 会**立即执行** `fn`，并把返回值登记为清理函数。

测试里若把桩写成 `effect: () => {}`（不执行回调），那么「注册 provider」这条路径在测试里根本没跑过——缺陷会被完全掩盖。本仓库曾因此漏掉上面的 disposer 问题。

正确的桩：

```js
effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} }
```

## 四、升级宿主后的核验清单

1. `npm test` —— 113 项行为测试
2. `node scripts/verify.mjs` —— 元信息与 patch 行校验
3. 真启动 web profile，确认无 `skipping profile bundle` / `disabling profile plugin`
4. 打开设置卡，确认技能开关能实时影响模型侧目录（这一步验的是 `loader/volatile-update` 与 invalidate 链路）

## 五、兼容声明的判定规则

宿主只读两处：`engines.dsh`（有则**独占判定**、peer 全旁路），否则只校验 `@deepseek-ai/dsh*` 前缀的 peer。`@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 不参与判定。

本插件声明 `engines.dsh: ">=0.2.2-rc.1"`，因此判定只看这一条。

预发布版本必须带 `includePrerelease: true` 才判得对。
