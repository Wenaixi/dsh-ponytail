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
    // 技能描述不翻译（用户边界）：由 server/frontmatter 下发，字典不含技能描述键
    var NS = "ponytail";
    var ZH = {"meta":{"title":"懒人模式（ponytail）","description":"DietrichGebert/ponytail 的 DSH 完整移植：常驻懒人 senior 模式与七阶梯子（YAGNI 到最小实现），6 个中文原生技能（本体、评审、审计、债务、收益、帮助），零 tool 注册。"},"panel":{"title":"懒人模式配置"},"mode":{"title":"运行强度等级","hint":"控制梯子提示词的注入强度，改动即时生效并写入配置文件，对所有会话生效。","lockedHint":"当前有更高优先级的配置在生效，此处的修改不会改变实际运行等级。","off":"关闭","lite":"轻量","full":"标准","ultra":"激进"},"skills":{"title":"原生技能开关","hint":"关闭后该技能不会出现在斜杠菜单，也不会被模型加载。","toggleOn":"启用 {name}","enabledToast":"技能 {name} 已启用","hiddenToast":"技能 {name} 已隐藏"},"chain":{"hit":"生效中","shadowed":"被覆盖","unset":"未设置","valueUnset":"(未设置)"},"priority":{"title":"配置优先级","unavailable":"诊断信息不可用，请确认宿主版本已包含优先级诊断接口。","intro":"运行等级按下列顺序取第一个有效值；被更高优先级压制的项，在界面上修改不会生效。当前生效："},"state":{"loading":"读取中…","saved":"配置保存在 DSH 数据目录的 ponytail/config.json"},"error":{"operation":"操作失败："},"confirm":{"reset":"确定恢复默认配置吗？等级回到标准（full），并重新启用全部 6 个技能。"},"button":{"reset":"恢复默认配置"},"toast":{"modeChanged":"运行等级已切为「{name}」","resetDone":"已恢复默认配置"},"level":{"env":"环境变量","patch":"Profile 补丁","config":"用户配置文件","fallback":"内置兜底"},"problem":{"env":"值无效，已忽略","patch":"值无效，已忽略","config":"文件损坏或字段缺失"}};
    var EN = {"meta":{"title":"Ponytail (lazy senior mode)","description":"A full DSH port of DietrichGebert/ponytail: the always-on lazy senior developer mode and its seven-rung ladder (YAGNI down to the minimum implementation), with six native Chinese skills (core, review, audit, debt, gain, help) and zero tool registrations."},"panel":{"title":"Ponytail Config"},"mode":{"title":"Intensity Level","hint":"Controls how strongly the ladder prompt is injected. Changes apply immediately and are written to the config file for all sessions.","lockedHint":"A higher-priority configuration is in effect; changes here will not affect the actual runtime level.","off":"Off","lite":"Lite","full":"Standard","ultra":"Ultra"},"skills":{"title":"Native Skills","hint":"Disabled skills disappear from the slash menu and are not loaded by the model.","toggleOn":"Enable {name}","enabledToast":"Skill {name} enabled","hiddenToast":"Skill {name} hidden"},"chain":{"hit":"In effect","shadowed":"Shadowed","unset":"Unset","valueUnset":"(unset)"},"priority":{"title":"Config Priority","unavailable":"Diagnostics unavailable. Please confirm the host version ships the priority diagnostics endpoint.","intro":"The runtime level takes the first valid value in the following order; items shadowed by a higher-priority source cannot be changed from the UI. Current: "},"state":{"loading":"Loading…","saved":"Config is stored in ponytail/config.json under the DSH data directory"},"error":{"operation":"Operation failed: "},"confirm":{"reset":"Restore default config? Level returns to Standard (full) and all 6 skills are re-enabled."},"button":{"reset":"Restore defaults"},"toast":{"modeChanged":"Level switched to {name}","resetDone":"Defaults restored"},"level":{"env":"Environment variable","patch":"Profile patch","config":"User config file","fallback":"Built-in fallback"},"problem":{"env":"Invalid value, ignored","patch":"Invalid value, ignored","config":"File corrupted or field missing"}};
    // t 在 apply 时经 ctx.locale.bind 赋值；组件读取 factory 级变量（不接收 ctx，铁律）
    var localeCtx = null;
    var t = function (key, params) {
      var s = ZH;
      var k = key;
      var seg = k.split(".");
      for (var i = 0; i < seg.length; i++) s = s ? s[seg[i]] : undefined;
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
        minWidth: "0",
        flex: "1",
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
        minWidth: "0",
        flex: "1",
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

    const MODE_OPTIONS = [
      { value: "off", label: t("mode.off") },
      { value: "lite", label: t("mode.lite") },
      { value: "full", label: t("mode.full") },
      { value: "ultra", label: t("mode.ultra") },
    ];


    // 技能元数据从 SKILL.md frontmatter 提取（唯一真源，与宿侧 readSkillMeta 同源）
    const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
    const SKILL_META = [{"id":"ponytail","description":"强制使用最懒但可用的解法，追求最简、最短、最精。像一位见过一切的老手：先质疑需求是否该存在（YAGNI），优先复用标准库、平台原生能力，一行能解决就不用五十行。支持 lite/full（默认）/ultra 三档强度。适用于任何编码任务：编写、新增、重构、修复、评审、设计代码，以及选型依赖。触发词：ponytail / 偷懒 / 懒人模式 / 最简解法 / 最小解法 / yagni / 少做一点 / 最短路径 / 讨厌过度设计、臃肿、样板代码、没必要的依赖时也请使用。非编码请求（常识、文案、翻译、总结、菜谱）请勿使用。\n"},{"id":"ponytail-audit","description":"全仓过度设计审计，类似 ponytail-review，但扫描的是整个代码库而非 diff：按可删行数排序，列出能删、能简化、能用标准库/原生替代的地方。触发词：审计代码库 / 审计过度设计 / 这个仓库能删什么 / 找臃肿 / ponytail-audit / /ponytail-audit。一次性报告，不直接改代码。\n"},{"id":"ponytail-debt","description":"把代码库中所有 `ponytail:` 注释收割为债务台账，让 ponytail 有意留下的捷径和延期不会悄悄烂成「以后再说就是永远不做」。触发词：ponytail debt / /ponytail-debt / ponytail 延期了什么 / 列出捷径 / ponytail 台账 / 标记了什么待做。一次性报告，不改代码。\n"},{"id":"ponytail-gain","description":"以精简看板展示 ponytail 的实测收益：更少代码、更低成本、更快速度，数据来自 benchmark 中位数。一次性展示，非持久模式，也非本仓实时统计。触发词：/ponytail-gain / ponytail gain / ponytail 能省多少 / 展示 ponytail 收益 / ponytail 看板。\n"},{"id":"ponytail-help","description":"ponytail 全量模式、技能与命令的速查卡，一次性展示，非持久模式。触发词：/ponytail-help / ponytail help / ponytail 有哪些命令 / 怎么用 ponytail。\n"},{"id":"ponytail-review","description":"专挑过度设计的代码评审，只找能删的东西：重复造的标准库、没必要的依赖、臆想的抽象、闲置的灵活性。每条发现一行写完：位置、该删什么、用什么替代。触发词：过度设计评审 / 能删什么 / 是否过度设计 / 简化评审 / ponytail-review / /ponytail-review。配合面向正确性的评审使用，本技能只猎复杂度。\n"}];

    const EMPTY_CONFIG = {
      currentMode: "full",
      defaultMode: "full",
      disabledSkills: [],
      skills: SKILL_META.map(function (s) {
        return { id: s.id, name: s.id, description: s.description, enabled: true };
      }),
      priority: null,
    };

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

    function PonytailConfigPanel() {
      const [state, setState] = React.useState({
        loading: true,
        saving: false,
        error: null,
        toast: null,
        config: EMPTY_CONFIG,
      });

      const applyResult = React.useCallback(function (data, message) {
        setState(function (prev) {
          return Object.assign({}, prev, {
            loading: false,
            saving: false,
            error: null,
            config: data && Array.isArray(data.skills) ? data : prev.config,
            toast: message,
          });
        });
        if (message) {
          setTimeout(function () {
            setState(function (prev) {
              return Object.assign({}, prev, { toast: null });
            });
          }, 2600);
        }
      }, []);

      const load = React.useCallback(function () {
        fetch("/api/plugins/ponytail/config", { credentials: "same-origin" })
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
          })
          .then(function (data) {
            applyResult(data, null);
          })
          .catch(function (err) {
            setState(function (prev) {
              return Object.assign({}, prev, { loading: false, error: String(err) });
            });
          });
      }, [applyResult]);

      React.useEffect(function () {
        load();
        // 语言切换后重取（官方 LocaleFace subscribe 语义：字典注册 bump revision）
        var off = localeCtx ? localeCtx.subscribe(function () { load(); }) : null;
        return function () { if (off) off(); };
      }, [load]);

      const post = function (body, message) {
        setState(function (prev) {
          return Object.assign({}, prev, { saving: true, error: null, toast: null });
        });
        fetch("/api/plugins/ponytail/config", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then(function (res) {
            return res.json();
          })
          .then(function (data) {
            applyResult(data, message);
          })
          .catch(function (err) {
            setState(function (prev) {
              return Object.assign({}, prev, { saving: false, error: String(err) });
            });
          });
      };

      const config = state.config;
      // 配置被更高优先级压制时，等级选择器整体禁用，避免用户做无效操作
      const levelLocked = Boolean(config.priority && config.priority.chain && config.priority.chain.some(function (s) {
        return s.level !== "config" && s.hit && s.level !== "fallback";
      }));

      return e(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "720px" } },
        e("h3", { style: { fontSize: "15px", fontWeight: "600", margin: "0", color: "var(--dsw-alias-label-primary)" } },
          t("panel.title")),
        e(PrioritySection, { priority: config.priority }),
        e(
          "div",
          { style: L.section },
          e("h4", { style: L.title }, t("mode.title")),
          e("p", { style: L.hint },
            t("mode.hint")),
          e(P.SegmentedControl, {
            id: "ponytail-mode",
            label: t("mode.title"),
            value: config.defaultMode,
            options: MODE_OPTIONS,
            disabled: state.saving || levelLocked,
            onChange: function (next) {
              post({ mode: next }, t("toast.modeChanged", { name: next }));
            },
          }),
          levelLocked
            ? e("p", { style: Object.assign({}, L.hint, { color: "var(--dsw-alias-state-warn-primary)" }) },
                t("mode.lockedHint"))
            : null
        ),
        e(
          "div",
          { style: L.section },
          e("h4", { style: L.title }, t("skills.title")),
          e("p", { style: L.hint },
            t("skills.hint")),
          e(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            config.skills.map(function (skill) {
              return e(
                "div",
                { key: skill.id, style: L.row },
                e(
                  "div",
                  { style: L.rowText },
                  e("span", { style: L.rowName }, "/" + skill.name),
                  e("span", { style: L.rowDesc }, skill.description)
                ),
                e(P.Switch, {
                  checked: skill.enabled,
                  disabled: state.saving,
                  label: t("skills.toggleOn", { name: skill.name }),
                  onChange: function (next) {
                    post(
                      { toggleSkill: { name: skill.id, enabled: next } },
                      t(next ? "skills.enabledToast" : "skills.hiddenToast", { name: skill.name })
                    );
                  },
                })
              );
            })
          )
        ),
        e(
          "div",
          { style: Object.assign({}, L.footer, L.last) },
          e("span", { style: L.hint },
            state.error
              ? t("error.operation") + state.error
              : state.toast
                ? state.toast
                : state.loading
                  ? t("state.loading")
                  : t("state.saved")),
          e(P.Button, {
            variant: "outline",
            size: "sm",
            disabled: state.saving,
            onClick: function () {
              if (!confirm(t("confirm.reset"))) return;
              post({ action: "reset" }, t("toast.resetDone"));
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

      // 插件卡片详情页：内联配置面板（keyed by 包名，已核实宿主 listBundles 的 name 即包名）
      ctx.slots.inject("plugins.bundle.config", function () {
        return ctx.slots.register(
          { name: "plugins.bundle.config", key: "@wenaixi/dsh-ponytail" },
          PonytailConfigPanel
        );
      });
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    return module.exports;
  }
});
