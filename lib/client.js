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
    var ZH = {"button.reset":"恢复默认配置","chain.hit":"生效中","chain.shadowed":"被覆盖","chain.unset":"未设置","chain.valueUnset":"(未设置)","confirm.reset":"确定恢复默认配置吗？等级回到标准（full），并重新启用全部 6 个技能。","error.operation":"操作失败：","error.rejected":"本部署没有接受这次修改，值已保留供你核对。","level.config":"用户配置文件","level.env":"环境变量","level.fallback":"内置兜底","level.patch":"Profile 补丁","meta.description":"DietrichGebert/ponytail 的 DSH 完整移植：常驻懒人 senior 模式与七阶梯子（YAGNI 到最小实现），6 个中文原生技能（本体、评审、审计、债务、收益、帮助），零 tool 注册。","meta.title":"懒人模式（ponytail）","mode.full":"标准","mode.hint":"控制梯子提示词的注入强度，改动即时生效并写入配置文件，对所有会话生效。","mode.lite":"轻量","mode.lockedHint":"当前有更高优先级的配置在生效，此处的修改不会改变实际运行等级。","mode.off":"关闭","mode.title":"运行强度等级","mode.ultra":"激进","panel.title":"懒人模式配置","priority.intro":"运行等级按下列顺序取第一个有效值；被更高优先级压制的项，在界面上修改不会生效。当前生效：","priority.title":"配置优先级","priority.unavailable":"诊断信息不可用，请确认宿主版本已包含优先级诊断接口。","problem.config":"文件损坏或字段缺失","problem.env":"值无效，已忽略","problem.patch":"值无效，已忽略","skills.enabledToast":"技能 {name} 已启用","skills.hiddenToast":"技能 {name} 已隐藏","skills.hint":"关闭后该技能不会出现在斜杠菜单，也不会被模型加载。","skills.title":"原生技能开关","skills.toggleOn":"启用 {name}","state.loading":"读取中…","state.readOnly":"本部署的设置为只读。","state.saved":"配置保存在 DSH 数据目录的 ponytail/config.json","toast.modeChanged":"运行等级已切为「{name}」","toast.resetDone":"已恢复默认配置"};
    var EN = {"button.reset":"Restore defaults","chain.hit":"In effect","chain.shadowed":"Shadowed","chain.unset":"Unset","chain.valueUnset":"(unset)","confirm.reset":"Restore default config? Level returns to Standard (full) and all 6 skills are re-enabled.","error.operation":"Operation failed: ","error.rejected":"This deployment did not accept the change; your value was kept for you to review.","level.config":"User config file","level.env":"Environment variable","level.fallback":"Built-in fallback","level.patch":"Profile patch","meta.description":"A full DSH port of DietrichGebert/ponytail: the always-on lazy senior developer mode and its seven-rung ladder (YAGNI down to the minimum implementation), with six native Chinese skills (core, review, audit, debt, gain, help) and zero tool registrations.","meta.title":"Ponytail (lazy senior mode)","mode.full":"Standard","mode.hint":"Controls how strongly the ladder prompt is injected. Changes apply immediately and are written to the config file for all sessions.","mode.lite":"Lite","mode.lockedHint":"A higher-priority configuration is in effect; changes here will not affect the actual runtime level.","mode.off":"Off","mode.title":"Intensity Level","mode.ultra":"Ultra","panel.title":"Ponytail Config","priority.intro":"The runtime level takes the first valid value in the following order; items shadowed by a higher-priority source cannot be changed from the UI. Current: ","priority.title":"Config Priority","priority.unavailable":"Diagnostics unavailable. Please confirm the host version ships the priority diagnostics endpoint.","problem.config":"File corrupted or field missing","problem.env":"Invalid value, ignored","problem.patch":"Invalid value, ignored","skills.enabledToast":"Skill {name} enabled","skills.hiddenToast":"Skill {name} hidden","skills.hint":"Disabled skills disappear from the slash menu and are not loaded by the model.","skills.title":"Native Skills","skills.toggleOn":"Enable {name}","state.loading":"Loading…","state.readOnly":"This deployment stores settings read-only.","state.saved":"Config is stored in ponytail/config.json under the DSH data directory","toast.modeChanged":"Level switched to {name}","toast.resetDone":"Defaults restored"};
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

    // 档位标签在 apply 时才绑定 locale（t 是 factory 级可变变量），因此按需取值而不是模块级求值
    function modeOptions() {
      return [
        { value: "off", label: t("mode.off") },
        { value: "lite", label: t("mode.lite") },
        { value: "full", label: t("mode.full") },
        { value: "ultra", label: t("mode.ultra") },
      ];
    }

    // 技能元数据从 SKILL.md frontmatter 构建期提取（唯一真源，与宿侧 readSkillMeta 同源）。
    // 「是否启用」不再随服务端下发：它就是 configForms 快照里的 disabledSkills 取反。
    const SKILL_META = [{"id":"ponytail","description":"强制使用最懒但可用的解法，追求最简、最短、最精。像一位见过一切的老手：先质疑需求是否该存在（YAGNI），优先复用标准库、平台原生能力，一行能解决就不用五十行。支持 lite/full（默认）/ultra 三档强度。适用于任何编码任务：编写、新增、重构、修复、评审、设计代码，以及选型依赖。触发词：ponytail / 偷懒 / 懒人模式 / 最简解法 / 最小解法 / yagni / 少做一点 / 最短路径 / 讨厌过度设计、臃肿、样板代码、没必要的依赖时也请使用。非编码请求（常识、文案、翻译、总结、菜谱）请勿使用。\n"},{"id":"ponytail-audit","description":"全仓过度设计审计，类似 ponytail-review，但扫描的是整个代码库而非 diff：按可删行数排序，列出能删、能简化、能用标准库/原生替代的地方。触发词：审计代码库 / 审计过度设计 / 这个仓库能删什么 / 找臃肿 / ponytail-audit / /ponytail-audit。一次性报告，不直接改代码。\n"},{"id":"ponytail-debt","description":"把代码库中所有 `ponytail:` 注释收割为债务台账，让 ponytail 有意留下的捷径和延期不会悄悄烂成「以后再说就是永远不做」。触发词：ponytail debt / /ponytail-debt / ponytail 延期了什么 / 列出捷径 / ponytail 台账 / 标记了什么待做。一次性报告，不改代码。\n"},{"id":"ponytail-gain","description":"以精简看板展示 ponytail 的实测收益：更少代码、更低成本、更快速度，数据来自 benchmark 中位数。一次性展示，非持久模式，也非本仓实时统计。触发词：/ponytail-gain / ponytail gain / ponytail 能省多少 / 展示 ponytail 收益 / ponytail 看板。\n"},{"id":"ponytail-help","description":"ponytail 全量模式、技能与命令的速查卡，一次性展示，非持久模式。触发词：/ponytail-help / ponytail help / ponytail 有哪些命令 / 怎么用 ponytail。\n"},{"id":"ponytail-review","description":"专挑过度设计的代码评审，只找能删的东西：重复造的标准库、没必要的依赖、臆想的抽象、闲置的灵活性。每条发现一行写完：位置、该删什么、用什么替代。触发词：过度设计评审 / 能删什么 / 是否过度设计 / 简化评审 / ponytail-review / /ponytail-review。配合面向正确性的评审使用，本技能只猎复杂度。\n"}];

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
     * 读取官方远程命名空间的 snapshot，作为只读推导值的来源。
     *
     * 为什么必须重试：网关按宿主服务上的 typertRemote 绑定安装命名空间，而安装本身
     * 是异步的（ClientRemoteService.$mount → enqueue → installNamespace → await fiber，
     * dsh-api-gateway/lib/client.js:1636-1748）。本插件的 apply() 与它同批执行，
     * 同步问一次必然拿到 undefined，界面会永久停在「诊断信息不可用」——
     * 而宿主其实完全正常。
     *
     * 为什么不用事件：网关客户端侧只暴露 connection/reset，没有「命名空间已挂载」信号，
     * 为此轮询几拍是最省事也最诚实的做法。上限写死为 RETRY：超出即认定该部署
     * 没有这个端点（如精简宿主），如实降级为不显示，不再空转。
     */
    var REMOTE_MOUNT_RETRY = 40;
    var REMOTE_MOUNT_INTERVAL_MS = 50;

    function createRemoteStore(ctx, namespace) {
      var store = createStore({ status: "loading", value: null });
      var method = "snapshot";
      var attempts = 0;
      var timer = null;

      var fail = function () {
        store.set({ status: "unavailable", value: null });
      };

      var load = function () {
        var ns = ctx.get("remote." + namespace);
        if (ns === undefined || ns === null || typeof ns[method] !== "function") {
          attempts += 1;
          if (attempts >= REMOTE_MOUNT_RETRY) {
            fail();
            return;
          }
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(load, REMOTE_MOUNT_INTERVAL_MS);
          return;
        }
        attempts = 0;
        Promise.resolve(ns[method]()).then(function (response) {
          if (response && response.ok === true) store.set({ status: "ready", value: response.value });
          else fail();
        }).catch(fail);
      };
      load();
      // 配置表单写入成功后由面板调用：重新拉一次服务端真值（当前等级可能已变）
      store.reload = load;
      store.dispose = function () { if (timer !== null) clearTimeout(timer); };
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
        ], t("toast.resetDone"));
      }, [applyOps]);

      const config = snapshot.value || {};
      const defaultMode = typeof config.defaultMode === "string" ? config.defaultMode : null;
      // 配置被更高优先级压制时，等级选择器整体禁用，避免用户做无效操作
      const levelLocked = Boolean(remote && Array.isArray(remote.priority && remote.priority.chain) && remote.priority.chain.some(function (s) {
        return s.level !== "config" && s.level !== "patch" && s.hit;
      }));

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
            value: defaultMode === null ? remote && remote.priority ? remote.priority.effective : "full" : defaultMode,
            options: modeOptions(),
            disabled: busy || !writable || levelLocked,
            onChange: setMode,
          }),
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
          e(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            SKILL_META.map(function (skill) {
              const enabled = disabled.indexOf(skill.id) < 0;
              return e(
                "div",
                { key: skill.id, style: L.row },
                e(
                  "div",
                  { style: L.rowText },
                  e("span", { style: L.rowName }, "/" + skill.id),
                  e("span", { style: L.rowDesc }, skill.description)
                ),
                e(P.Switch, {
                  checked: enabled,
                  disabled: busy || !writable,
                  label: t("skills.toggleOn", { name: skill.id }),
                  onChange: function (next) { toggleSkill(skill.id, next); },
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

    function apply(ctx) {
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
      // 优先级段降级为不显示，不影响其余控件。
      var remoteStore = createRemoteStore(ctx, "ponytail");

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
    exports.inject = ["slots", "locale", "configForms"];
    return module.exports;
  }
});
