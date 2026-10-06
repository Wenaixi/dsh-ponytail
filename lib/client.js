window.__ModuleLoader__.load({
  id: "@wenaixi/dsh-ponytail",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let React = require("react");
    let P = require("@deepseek-ai/dsh-client-ui-primitives");
    let e = React.createElement;

    // 官方 locale 接入：注册 ponytail 命名空间双语字典（真源 locale/*.json，构建期内嵌）
    // 技能描述不翻译（用户边界）：由 configForms 快照与快照通道下发，字典不含技能描述键
    var NS = "ponytail";
    var ZH = {"button.reset":"恢复默认配置","chain.hit":"生效中","chain.shadowed":"被覆盖","chain.unset":"未设置","chain.valueUnset":"(未设置)","confirm.reset":"确定恢复默认配置吗？等级回到标准（full），并重新启用全部 6 个技能。","error.operation":"操作失败：","error.rejected":"本部署没有接受这次修改，值已保留供你核对。","lang.auto":"跟随宿主（自动）","lang.changed":"技能描述语言已切为「{name}」","lang.en":"English","lang.followHost":"已切为跟随宿主语言","lang.title":"技能描述语言","lang.unsetHint":"未配置：当前跟随宿主语言（{lang}），可在上方显式切换","lang.zh":"中文","level.env":"环境变量","level.fallback":"内置兜底","level.patch":"Profile 补丁","meta":{"title":"懒人模式","description":"常驻懒人资深开发者模式与七阶梯子（YAGNI 到最小实现），6 个中文原生技能（本体、评审、审计、债务、收益、帮助），零 Tool 注册。"},"meta.description":"DietrichGebert/ponytail 的 DSH 完整移植：常驻懒人 senior 模式与七阶梯子（YAGNI 到最小实现），6 个中文原生技能（本体、评审、审计、债务、收益、帮助），零 tool 注册。","meta.title":"懒人模式（ponytail）","mode.full":"标准","mode.hint":"控制梯子提示词的注入强度，改动即时生效并写入配置文件，对所有会话生效。","mode.lite":"轻量","mode.lockedHint":"当前有更高优先级的配置在生效，此处的修改不会改变实际运行等级。","mode.off":"关闭","mode.title":"运行强度等级","mode.ultra":"激进","mode.unset":"未设置","mode.unsetHint":"Profile 补丁未配置运行等级，当前由内置兜底决定。点上方任一档位即写入补丁。","panel.title":"懒人模式配置","priority.intro":"运行等级按下列顺序取第一个有效值；被更高优先级压制的项，在界面上修改不会生效。当前生效：","priority.title":"配置优先级","priority.unavailable":"诊断信息不可用，请确认宿主版本已包含优先级诊断接口。","problem.env":"值无效，已忽略","problem.patch":"值无效，已忽略","skills.enabledToast":"技能 {name} 已启用","skills.hiddenToast":"技能 {name} 已隐藏","skills.hint":"关闭后该技能不会出现在斜杠菜单，也不会被模型加载。","skills.title":"原生技能开关","skills.toggleOn":"启用 {name}","state.loading":"读取中…","state.readOnly":"本部署的设置为只读。","state.saved":"配置保存在当前 profile 的 ponytail 目录","toast.modeChanged":"运行等级已切为「{name}」","toast.resetDone":"已恢复默认配置"};
    var EN = {"button.reset":"Restore defaults","chain.hit":"In effect","chain.shadowed":"Shadowed","chain.unset":"Unset","chain.valueUnset":"(unset)","confirm.reset":"Restore default config? Level returns to Standard (full) and all 6 skills are re-enabled.","error.operation":"Operation failed: ","error.rejected":"This deployment did not accept the change; your value was kept for you to review.","lang.auto":"Follow host (auto)","lang.changed":"Skill description language switched to {name}","lang.en":"English","lang.followHost":"Now following the host language","lang.title":"Skill description language","lang.unsetHint":"Not set: follows the host language ({lang}); switch explicitly above","lang.zh":"中文","level.env":"Environment variable","level.fallback":"Built-in fallback","level.patch":"Profile patch","meta":{"title":"Lazy Senior Dev Mode","description":"Persistent lazy senior developer mode with a seven-rung ladder (YAGNI down to the smallest implementation), six native skills, and zero tool registration."},"meta.description":"A full DSH port of DietrichGebert/ponytail: the always-on lazy senior developer mode and its seven-rung ladder (YAGNI down to the minimum implementation), with six native Chinese skills (core, review, audit, debt, gain, help) and zero tool registrations.","meta.title":"Ponytail (lazy senior mode)","mode.full":"Standard","mode.hint":"Controls how strongly the ladder prompt is injected. Changes apply immediately and are written to the config file for all sessions.","mode.lite":"Lite","mode.lockedHint":"A higher-priority configuration is in effect; changes here will not affect the actual runtime level.","mode.off":"Off","mode.title":"Intensity Level","mode.ultra":"Ultra","mode.unset":"Unset","mode.unsetHint":"The profile patch has no intensity level; the built-in fallback decides it now. Picking any level above writes it to the patch.","panel.title":"Lazy Senior Dev Mode settings","priority.intro":"The runtime level takes the first valid value in the following order; items shadowed by a higher-priority source cannot be changed from the UI. Current: ","priority.title":"Config Priority","priority.unavailable":"Diagnostics unavailable. Please confirm the host version ships the priority diagnostics endpoint.","problem.env":"Invalid value, ignored","problem.patch":"Invalid value, ignored","skills.enabledToast":"Skill {name} enabled","skills.hiddenToast":"Skill {name} hidden","skills.hint":"Disabled skills disappear from the slash menu and are not loaded by the model.","skills.title":"Native Skills","skills.toggleOn":"Enable {name}","state.loading":"Loading…","state.readOnly":"This deployment stores settings read-only.","state.saved":"Config is stored in the ponytail directory of the current profile","toast.modeChanged":"Level switched to {name}","toast.resetDone":"Defaults restored"};
    // t 在 apply 时经 ctx.locale.bind 赋值；组件读取 factory 级变量（不接收 ctx，铁律）
    var localeCtx = null;
    var t = function (key, params) {
      var s = ZH[key];
      if (typeof s === "string" && params) {
        return s.replace(/{([^}]+)}/g, function (_, n) { return params[n] != null ? String(params[n]) : ""; });
      }
      return typeof s === "string" ? s : key;
    };

    // 只做布局，不定义视觉：颜色与形状一律交给 DSH 官方组件与 CSS 变量
    const L = {
      section: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        paddingBottom: "16px",
        borderBottom: "1px solid var(--dsw-alias-border-l2)",
      },
      last: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        paddingTop: "4px",
      },
      title: {
        fontSize: "13px",
        fontWeight: "600",
        color: "var(--dsw-alias-label-primary)",
        margin: 0,
      },
      hint: {
        fontSize: "12px",
        color: "var(--dsw-alias-label-tertiary)",
        margin: 0,
        lineHeight: 1.5,
      },
      chainRow: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 10px",
        borderRadius: "var(--dsw-radius-sm, 6px)",
        backgroundColor: "var(--dsw-alias-bg-layer-1)",
      },
      chainMain: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: 0,
        flex: 1,
      },
      chainName: {
        fontSize: "13px",
        color: "var(--dsw-alias-label-primary)",
      },
      chainLoc: {
        fontSize: "11px",
        color: "var(--dsw-alias-label-tertiary)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      },
      row: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px 10px",
        borderRadius: "var(--dsw-radius-sm, 6px)",
        backgroundColor: "var(--dsw-alias-bg-layer-1)",
      },
      rowText: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: 0,
        flex: 1,
      },
      rowName: {
        fontSize: "13px",
        color: "var(--dsw-alias-label-primary)",
      },
      rowDesc: {
        fontSize: "12px",
        color: "var(--dsw-alias-label-tertiary)",
        lineHeight: 1.4,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      footer: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      },
    };

    // 档位标签在 apply 时才绑定 locale（t 是 factory 级可变变量），因此按需取值而不是模块级求值。
    //
    // configured=false（补丁未写 defaultMode）时末尾追加一段真实的「未设置」选项，而不是把 value
    // 置成一个不在 options 里的值：官方 SegmentedControl 用 options.findIndex 求下标，
    // 下标 -1 会让所有段 tabIndex=-1（键盘不可达）且指示器整颗滑出轨道左缘
    // （dsh-client-ui-primitives/lib/index.js:3410-3492 与 SegmentedControl.module.css）。
    // 「未设置」排在末尾而非首位：未配置态下 关闭/轻量/标准/激进 仍占 0-3 段，
    // 配好之后四档位置不变，用户已有的肌肉记忆不被打断。
    function modeOptions(configured) {
      var options = [
        { value: "off", label: t("mode.off") },
        { value: "lite", label: t("mode.lite") },
        { value: "full", label: t("mode.full") },
        { value: "ultra", label: t("mode.ultra") },
      ];
      if (!configured) options.push({ value: "unset", label: t("mode.unset") });
      return options;
    }

    // 技能 id 列表是构建期常量；描述与语言来自 remote 快照（与模型目录同源）。
    // 构建期内嵌描述会让语言切换停在旧值，所以这里只带 id。
    // 「是否启用」不再随服务端下发：它就是 configForms 快照里的 disabledSkills 取反。
    const SKILL_IDS = ["ponytail","ponytail-audit","ponytail-debt","ponytail-gain","ponytail-help","ponytail-review"];

    // 诊断链一行的状态语义：生效 / 被覆盖 / 未设置 / 有问题
    function chainRowState(source) {
      if (source.problem) {
        return { dot: "error", tone: "danger", text: t("problem." + source.level) };
      }
      if (source.hit) {
        return { dot: "done", tone: "success", text: t("chain.hit") };
      }
      if (source.shadowed) {
        return { dot: "warning", tone: "warning", text: t("chain.shadowed") };
      }
      return { dot: "idle", tone: "quiet", text: t("chain.unset") };
    }

    function ChainRow(props) {
      const source = props.source;
      const visual = chainRowState(source);
      return e(
        "div",
        { style: L.chainRow },
        e(P.StateDot, { state: visual.dot, size: 10, appearance: "dot" }),
        e(
          "div",
          { style: L.chainMain },
          e("span", { style: L.chainName }, t("level." + source.level)),
          e("span", { style: L.chainLoc }, source.location + " = " + (source.value === null ? t("chain.valueUnset") : source.value))
        ),
        e(P.Tag, { tone: visual.tone }, visual.text)
      );
    }

    function PrioritySection(props) {
      const report = props.priority;
      if (!report || !Array.isArray(report.chain) || report.chain.length === 0) {
        return e(
          "div",
          { style: L.section },
          e("h4", { style: L.title }, t("priority.title")),
          e("p", { style: L.hint }, t("priority.unavailable"))
        );
      }
      return e(
        "div",
        { style: L.section },
        e("h4", { style: L.title }, t("priority.title")),
        e(
          "p",
          { style: L.hint },
          t("priority.intro"),
          e("strong", { style: { color: "var(--dsw-alias-label-primary)" } }, report.effective)
        ),
        e(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px" } },
          report.chain.map(function (source) {
            return e(ChainRow, { key: source.level, source: source });
          })
        )
      );
    }

    /**
     * 只读快照的最小 store：{ status, value }，够 React 的 useSyncExternalStore 订阅。
     * 不引第三方 store 库——快照就一个对象，一个 Set 监听者 + 一个 getSnapshot 足够。
     */
    function createStore(initial) {
      var listeners = new Set();
      var current = initial;
      return {
        getSnapshot: function () { return current; },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () { listeners.delete(listener); };
        },
        set: function (next) {
          current = next;
          listeners.forEach(function (listener) { listener(); });
        },
      };
    }

    /**
     * 本插件在浏览器侧向官方网关声明的 Remote 贡献。
     *
     * 为什么必须显式声明：网关的命名空间不是按需自动开通的。浏览器侧装配时
     * dsh-api-remotes 只遍历一份编译期写死的官方贡献清单并逐个 ctx.remote.$mount()
     *（dsh-api-remotes/lib/client.js:13512-13538，25 项，不含本插件）。
     * 宿主侧 TypertRemoteService 只负责把端点暴露出去；客户端不 $mount，
     * remote.ponytail 就永远不会出现——面板因此永久停在「诊断信息不可用」，
     * 而宿主完全正常。写法参照官方第三方插件 dsh-experimental-client-ui-voice-input。
     *
     * result.create 是网关不校验的钩子（requireStrictCodec 只看 mode === "strict"，
     * 见 dsh-api-gateway/lib/client.js:2073），解码走 result.decode，缺省即原样透传
     * （同文件 1801 行）。因此返回恒等函数即可把服务端 JSON 原样送进面板，
     * 不必为此引入 zod。
     */
    var PONYTAIL_REMOTE = {
      package: "@wenaixi/dsh-ponytail",
      descriptors: [
        {
          id: "@wenaixi/dsh-ponytail#ponytailRemote/snapshot",
          service: "ponytailRemote",
          namespace: "ponytail",
          method: "snapshot",
          invocation: { kind: "direct" },
          parameters: [],
          result: {
            mode: "strict",
            typeSymbol: "@wenaixi/dsh-ponytail/types#PonytailSnapshot",
            create: function (value) { return value; },
          },
          sourceLocation: {
            file: "src/ponytail-remote.ts",
            line: 1,
            column: 1,
          },
        },
      ],
    };
    /** 挂载失败时的快照 store：面板按 status 降级为不显示该段。 */
    function createUnavailableStore() {
      var store = createStore({ status: "unavailable", value: null });
      store.reload = function () {};
      store.dispose = function () {};
      return store;
    }

    /**
     * 读取本插件已 $mount 的命名空间 snapshot，作为只读推导值的来源。
     *
     * 不再有轮询：命名空间由本文件下方的 PONYTAIL_REMOTE 经 ctx.remote.$mount() 挂载，
     * $mount 返回的 disposer 之前挂载一定已经完成（它内部 await fiber，
     * dsh-api-gateway/lib/client.js:1636-1646），因此同步问一次即可。
     * 挂载失败（精简宿主没有 remote 服务）时立即降级为不显示，不再空转——
     * 上一版的 40×50ms 轮询掩盖的是「压根没挂载」这个事实，而不只是时序。
     */
    function createRemoteStore(ctx, namespace) {
      var store = createStore({ status: "loading", value: null });
      var method = "snapshot";

      var fail = function () {
        store.set({ status: "unavailable", value: null });
      };

      var load = function () {
        var ns = ctx.get("remote." + namespace);
        if (ns === undefined || ns === null || typeof ns[method] !== "function") {
          fail();
          return;
        }
        Promise.resolve(ns[method]()).then(function (response) {
          if (response && response.ok === true) store.set({ status: "ready", value: response.value });
          else fail();
        }).catch(fail);
      };
      load();
      // 配置表单写入成功后由面板调用：重新拉一次服务端真值（当前等级可能已变）
      store.reload = load;
      store.dispose = function () {};
      return store;
    }

    function PonytailConfigPanel(props) {
      // 官方配置表单的快照：status / value / base / user / revision / writable
      // （dsh-client-ui-settings 的 ConfigFormController，lib/client.js:1117-1131）。
      const snapshot = props.usePonytailConfig(function (s) { return s; });
      const [busy, setBusy] = React.useState(false);
      const [note, setNote] = React.useState(null);

      // 只读推导值来自远程命名空间；服务端不可用时降级为 null（不显示该段）
      const snapshotRemote = props.usePonytailSnapshot(function (s) { return s; });
      const remote = snapshotRemote.value;

      const writable = snapshot.writable === true && snapshot.status === "ready";

      // 写入：全部经官方 settings 通道，携带 revision 做冲突检测。
      // 服务端拒绝时 mutate 返回 false，此时以服务端读回的下一份快照为准，
      // 不做本地乐观改值——面板显示的必须是真值。
      const applyOps = React.useCallback(function (ops, message) {
        setBusy(true);
        setNote(null);
        // 写入经 face 注入的官方表单控制器（renderable 的 inject 面会把 hooks 绑成
        // use<Name>，其余键原样作为 props）。此前这里读 props.scope，而 scope 是 apply
        // 闭包里的变量、从未放进 face——点击即 TypeError，界面表现为「改了没反应且卡住」。
        props.mutate(ops, snapshot.revision).then(function (landed) {
          setBusy(false);
          setNote(landed ? message : t("error.rejected"));
          // 档位写入后重新拉一次服务端真值：当前生效等级可能随之改变，
          // 而它不在 configForms 快照里（那是持久化配置，不是运行时推导值）。
          if (landed && props.reloadRemote) props.reloadRemote();
        });
      }, [props.mutate, snapshot.revision]);

      const setMode = React.useCallback(function (mode) {
        applyOps([{ op: "set", path: ["defaultMode"], value: mode }], t("toast.modeChanged", { name: mode }));
      }, [applyOps]);

      // 技能开关：disabledSkills 是覆盖式数组，每次写入都带上「目标技能的最终启用态」
      const disabled = snapshot.value && Array.isArray(snapshot.value.disabledSkills)
        ? snapshot.value.disabledSkills
        : [];
      const toggleSkill = React.useCallback(function (name, enabled) {
        const next = enabled ? disabled.filter(function (item) { return item !== name; }) : disabled.concat([name]);
        applyOps([{ op: "set", path: ["disabledSkills"], value: next }],
          enabled ? t("skills.enabledToast", { name: name }) : t("skills.hiddenToast", { name: name }));
      }, [applyOps, disabled]);

      const resetAll = React.useCallback(function () {
        applyOps([
          { op: "unset", path: ["defaultMode"] },
          { op: "unset", path: ["disabledSkills"] },
          { op: "unset", path: ["skillDescriptionLang"] },
        ], t("toast.resetDone"));
      }, [applyOps]);

      const config = snapshot.value || {};
      const defaultMode = typeof config.defaultMode === "string" ? config.defaultMode : null;
      // 配置值的有无，而不是运行时推导值的有无：defaultMode 无 Schema 默认值
      // （src/ponytail.ts），所以快照里读得到它，就说明用户的 profile 补丁里写了。
      const modeConfigured = defaultMode !== null;
      // 只有环境变量命中才锁：env 压过一切，此时改 patch 确实无效。
      // fallback 命中必须放行——那是「补丁与 env 都没写」的兜底，不是更高优先级的配置，
      // 用户改 patch 立刻生效（此前把 fallback 也当压制源，提示文案在说谎）。
      const levelLocked = Boolean(remote && Array.isArray(remote.priority && remote.priority.chain) && remote.priority.chain.some(function (s) {
        return s.level === "env" && s.hit;
      }));

      // 描述语言：三态（src/ponytail.ts 已去 Schema 默认值）。快照里读得到字段 = 显式配置
      // （zh/en，锁定）；读不到 = 未配置（跟随宿主）。
      // remote.skillLang 是服务端解析后的实际语言（显式值或按宿主对齐值），
      // 未配置时用它提示「当前跟随到 zh/en」。
      var descLangConfigured = typeof config.skillDescriptionLang === "string";
      var descLang = descLangConfigured ? config.skillDescriptionLang : "auto";
      // 「跟随宿主」是三态之一，不是一次性选项：用户配过一次 zh/en 后仍必须能切回来。
      // 因此第三段常驻，不按是否配置追加（等级控件的「未设置」段是「没配过」的状态标记，
      // 那里随配置收走合理，这里不行）。auto 固定排在末尾，zh/en 继续占 0、1 段。
      var descLangOptions = [
        { value: "zh", label: t("lang.zh") },
        { value: "en", label: t("lang.en") },
        { value: "auto", label: t("lang.auto") },
      ];
      var setDescLang = React.useCallback(function (lang) {
        if (lang === "auto") {
          applyOps([{ op: "unset", path: ["skillDescriptionLang"] }], t("lang.followHost"));
          return;
        }
        applyOps([{ op: "set", path: ["skillDescriptionLang"], value: lang }],
          t("lang.changed", { name: t("lang." + lang) }));
      }, [applyOps]);

      return e(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "720px" } },
        e("h3", { style: { fontSize: "15px", fontWeight: "600", margin: "0", color: "var(--dsw-alias-label-primary)" } },
          t("panel.title")),
        e(PrioritySection, { priority: remote ? remote.priority : null }),
        e(
          "div",
          { style: L.section },
          e("h4", { style: L.title }, t("mode.title")),
          e("p", { style: L.hint }, t("mode.hint")),
          e(P.SegmentedControl, {
            id: "ponytail-mode",
            label: t("mode.title"),
            // 控件只显示配置值，绝不回退到 priority.effective：那是运行时推导档
            // （env / 补丁 / 兜底合并的结果），回退会让刚安装的用户看到「标准」被高亮，
            // 像亲手选过一样。未配置就如实显示「未设置」段。
            // 「当前生效」由上方优先级链表独占呈现，这里不重复。
            value: modeConfigured ? defaultMode : "unset",
            options: modeOptions(modeConfigured),
            disabled: busy || !writable || levelLocked,
            onChange: setMode,
          }),
          !modeConfigured
            ? e("p", { style: L.hint }, t("mode.unsetHint"))
            : null,
          levelLocked
            ? e("p", { style: Object.assign({}, L.hint, { color: "var(--dsw-alias-state-warn-primary)" }) }, t("mode.lockedHint"))
            : null,
          !writable && snapshot.status === "ready"
            ? e("p", { style: Object.assign({}, L.hint, { color: "var(--dsw-alias-state-warn-primary)" }) }, t("state.readOnly"))
            : null
        ),
        e(
          "div",
          { style: L.section },
          e("h4", { style: L.title }, t("skills.title")),
          e("p", { style: L.hint }, t("skills.hint")),
          e(P.SegmentedControl, {
            id: "ponytail-desc-lang",
            label: t("lang.title"),
            value: descLang,
            options: descLangOptions,
            disabled: busy || !writable,
            onChange: setDescLang,
          }),
          !descLangConfigured
            ? e("p", { style: L.hint }, t("lang.unsetHint", { lang: t("lang." + (remote && (remote.skillLang === "en" || remote.skillLang === "zh") ? remote.skillLang : "zh")) }))
            : null,
          e(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            SKILL_IDS.map(function (id) {
              const enabled = disabled.indexOf(id) < 0;
              var meta = (remote && Array.isArray(remote.skills)
                ? remote.skills.find(function (s) { return s.id === id; })
                : null);
              return e(
                "div",
                { key: id, style: L.row },
                e(
                  "div",
                  { style: L.rowText },
                  e("span", { style: L.rowName }, "/" + id),
                  e("span", { style: L.rowDesc }, meta ? meta.description : id)
                ),
                e(P.Switch, {
                  checked: enabled,
                  disabled: busy || !writable,
                  label: t("skills.toggleOn", { name: id }),
                  onChange: function (next) { toggleSkill(id, next); },
                })
              );
            })
          )
        ),
        e(
          "div",
          { style: Object.assign({}, L.footer, L.last) },
          e("span", { style: L.hint },
            note !== null
              ? note
              : snapshot.status === "loading"
                ? t("state.loading")
                : t("state.saved")),
          e(P.Button, {
            variant: "outline",
            size: "sm",
            disabled: busy || !writable,
            onClick: function () {
              if (!confirm(t("confirm.reset"))) return;
              resetAll();
            },
          }, t("button.reset"))
        )
      );
    }

    async function apply(ctx) {
      // 先把只读推导值的端点挂到官方网关上：命名空间不会自动出现，
      // 必须由客户端显式声明并 $mount。$mount 返回的 disposer 即 effect 的清理函数。
      // 挂载失败（部署没有 remote 服务）不阻断其余能力，卡片照常出现，只是优先级段不显示。
      var mounted = null;
      try {
        mounted = await ctx.remote.$mount(PONYTAIL_REMOTE);
      } catch (error) {
        if (ctx.logger) ctx.logger.warn("[ponytail] remote 贡献挂载失败（优先级诊断段将不显示）: " + String(error));
      }
      ctx.effect(function () {
        return function () {
          if (mounted) void mounted();
        };
      }, "ponytail: remote contribution");

      // 官方 locale：注册 ponytail 命名空间双语字典并绑定 t（真源 locale/*.json 构建期内嵌）
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: ZH, en: EN });
      }, "ponytail: dictionaries");
      localeCtx = ctx.locale;
      t = ctx.locale.bind(NS);

      // 官方配置表单：宿主 settings 服务投影出的 ponytail 命名空间
      var scope = ctx.configForms.get("ponytail");

      // 只读推导值：官方 Typert 通道（ctx.remote.ponytail.snapshot()）。
      // 远程方法返回的是 { ok, value } / { ok:false, error } 信封（网关 client 侧 lib/client.js:1795-1802），
      // 这里自己拆包并折成一个最小快照 store：命名空间不可用或调用失败时停在 unavailable，
      // 优先级段降级为不显示，不影响其余控件。此处已在上面的 $mount 完成后才读，无需重试。
      var remoteStore = mounted === null
      ? createUnavailableStore()
      : createRemoteStore(ctx, "ponytail");

      // 插槽注册沿用 whileServed：命名空间没被宿主服务时卡片整体不出现，
      // 部署若从未组合 settings 服务，页面上不留本插件的痕迹
      // （与官方 dsh-client-ui-settings-shell 同一生命周期协议，ui-settings-shell/lib/client.js:182）。
      //
      // 数据面经 inject 提供：组件只从 props 消费，不触碰 ctx（渲染器铁律）。
      // usePonytailConfig 读官方配置表单快照；usePonytailSnapshot 读远程快照；
      // reloadRemote 在写入后让面板重新拉服务端真值。
      var formStore = {
        getSnapshot: function () { return scope.getSnapshot(); },
        subscribe: function (listener) { return scope.subscribe(listener); },
      };
      var face = function () {
        return {
          hooks: {
            ponytailConfig: formStore,
            ponytailSnapshot: remoteStore,
          },
          // 直接透传官方表单控制器的方法：它自带写队列串行化、revision 冲突恢复
          // 与镜像折入（dsh-client-ui-settings 的 ConfigFormController.mutate，lib/client.js:1177-1194）
          mutate: function (ops, revision) { return scope.mutate(ops, revision); },
          reloadRemote: function () { remoteStore.reload(); },
        };
      };

      ctx.effect(function () {
        return ctx.configForms.whileServed(["ponytail"], function () {
          return ctx.slots.inject("plugins.bundle.config", function () {
            return ctx.slots.register(
              { name: "plugins.bundle.config", key: "@wenaixi/dsh-ponytail", locale: NS, inject: face },
              PonytailConfigPanel
            );
          });
        });
      }, "ponytail: config card");
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "configForms", "remote"];
    return module.exports;
  }
});
