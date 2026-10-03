window.__ModuleLoader__.load({
  id: "@wenaixi/dsh-ponytail",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let React = require("react");
    let P = require("@deepseek-ai/dsh-client-ui-primitives");
    let e = React.createElement;

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
      },
      footer: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      },
    };

    const MODE_OPTIONS = [
      { value: "off", label: "关闭" },
      { value: "lite", label: "轻量" },
      { value: "full", label: "标准" },
      { value: "ultra", label: "激进" },
    ];

    const SKILL_META = [
      { id: "ponytail", description: "懒人模式本体：梯子七阶与三档强度总入口" },
      { id: "ponytail-review", description: "只挑过度设计：一行一条列出能删的代码" },
      { id: "ponytail-audit", description: "全仓审计：按可删行数降序猎取臃肿" },
      { id: "ponytail-debt", description: "收割 ponytail: 注释，建立延期债务台账" },
      { id: "ponytail-gain", description: "收益看板：展示 benchmark 中位数" },
      { id: "ponytail-help", description: "速查卡：模式、技能与命令一览" },
    ];

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
        return { dot: "error", tone: "danger", text: source.problem };
      }
      if (source.hit) {
        return { dot: "done", tone: "success", text: "生效中" };
      }
      if (source.shadowed) {
        return { dot: "warning", tone: "warning", text: "被覆盖" };
      }
      return { dot: "idle", tone: "quiet", text: "未设置" };
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
          e("span", { style: L.chainName }, source.label),
          e("span", { style: L.chainLoc }, source.location + " = " + (source.value === null ? "(未设置)" : source.value))
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
          e("h4", { style: L.title }, "配置优先级"),
          e("p", { style: L.hint }, "诊断信息不可用，请确认宿主版本已包含优先级诊断接口。")
        );
      }
      return e(
        "div",
        { style: L.section },
        e("h4", { style: L.title }, "配置优先级"),
        e(
          "p",
          { style: L.hint },
          "运行等级按下列顺序取第一个有效值；被更高优先级压制的项，在界面上修改不会生效。当前生效：",
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
        fetch("/api/plugins/ponytail/config")
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
      }, [load]);

      const post = function (body, message) {
        setState(function (prev) {
          return Object.assign({}, prev, { saving: true, error: null, toast: null });
        });
        fetch("/api/plugins/ponytail/config", {
          method: "POST",
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
          "懒人模式配置"),
        e(PrioritySection, { priority: config.priority }),
        e(
          "div",
          { style: L.section },
          e("h4", { style: L.title }, "运行强度等级"),
          e("p", { style: L.hint },
            "控制梯子提示词的注入强度，改动即时生效并写入配置文件，对所有会话生效。"),
          e(P.SegmentedControl, {
            id: "ponytail-mode",
            label: "运行强度等级",
            value: config.defaultMode,
            options: MODE_OPTIONS,
            disabled: state.saving || levelLocked,
            onChange: function (next) {
              post({ mode: next }, "运行等级已切为「" + next + "」");
            },
          }),
          levelLocked
            ? e("p", { style: Object.assign({}, L.hint, { color: "var(--dsw-alias-state-warn-primary)" }) },
                "当前有更高优先级的配置在生效，此处的修改不会改变实际运行等级。")
            : null
        ),
        e(
          "div",
          { style: L.section },
          e("h4", { style: L.title }, "原生技能开关"),
          e("p", { style: L.hint },
            "关闭后该技能不会出现在斜杠菜单，也不会被模型加载。"),
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
                  label: "启用 " + skill.name,
                  onChange: function (next) {
                    post(
                      { toggleSkill: { name: skill.id, enabled: next } },
                      "技能 " + skill.name + (next ? " 已启用" : " 已隐藏")
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
              ? "操作失败：" + state.error
              : state.toast
                ? state.toast
                : state.loading
                  ? "读取中…"
                  : "配置保存在 DSH 数据目录的 ponytail/config.json"),
          e(P.Button, {
            variant: "outline",
            size: "sm",
            disabled: state.saving,
            onClick: function () {
              if (!confirm("确定恢复默认配置吗？等级回到标准（full），并重新启用全部 6 个技能。")) return;
              post({ action: "reset" }, "已恢复默认配置");
            },
          }, "恢复默认配置")
        )
      );
    }

    // ---------------------------------------------------------------------
    // 常驻落点（对照 dsh-context：它的 9 个落点里 7 个是常驻 UI 位置，
    // 设置相关只占 2 个——不把 UI 赌在设置/插件管理页这一条链路上）
    // ---------------------------------------------------------------------

    // 侧边栏按钮与浮层面板共享的极简开关状态（模块级，HMR 重建即重置）
    var overlayStore = (function () {
      var open = false;
      var listeners = new Set();
      return {
        isOpen: function () { return open; },
        set: function (v) { open = v; for (var l of listeners) l(); },
        subscribe: function (l) { listeners.add(l); return function () { listeners.delete(l); }; },
      };
    })();

    function useOverlayOpen() {
      return React.useSyncExternalStore(overlayStore.subscribe, overlayStore.isOpen);
    }

    // 侧边栏底部入口按钮（sidebar.footer.action，list 型）
    function PonytailFooterButton() {
      var open = useOverlayOpen();
      return e(
        P.Button,
        {
          variant: open ? "primary" : "outline",
          size: "sm",
          onClick: function () { overlayStore.set(!open); },
        },
        "Ponytail"
      );
    }

    // 全局浮层层（shell.overlay，list 型）：点侧边栏按钮后弹出完整面板
    function PonytailOverlay() {
      var open = useOverlayOpen();
      if (!open) return null;
      var mask = {
        position: "fixed", inset: "0", zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
      };
      var card = {
        width: "min(720px, 92vw)", maxHeight: "82vh", overflow: "auto",
        backgroundColor: "var(--dsw-alias-bg-layer-1, #fff)",
        color: "var(--dsw-alias-label-primary)",
        border: "0.5px solid var(--dsw-alias-border-l2)",
        borderRadius: "var(--dsw-radius-md, 10px)",
        padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: "12px",
      };
      return e(
        "div",
        { style: mask, onClick: function () { overlayStore.set(false); } },
        e(
          "div",
          { style: card, onClick: function (ev) { ev.stopPropagation(); } },
          e(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            e("span", { style: { fontSize: "14px", fontWeight: "600" } }, "Ponytail 懒人模式"),
            e(P.Button, { variant: "outline", size: "sm", onClick: function () { overlayStore.set(false); } }, "关闭")
          ),
          e(PonytailConfigPanel)
        )
      );
    }

    // 自检标记：slots.inject 的 spec 不存在时回调【永不执行且零报错】，
    // 这里把「实际注册成功的落点」写进 window，桌面版排查时一眼可见。
    function track(slot) {
      var w = typeof window === "undefined" ? null : window;
      if (!w) return;
      var rec = w.__PONYTAIL_UI__ || (w.__PONYTAIL_UI__ = { registered: [], at: new Date().toISOString() });
      rec.registered.push(slot);
    }

    // 官方插件页两态：summary 是卡片描述位的一行文案，page 才是完整面板
    function PonytailEntry(props) {
      if (props && props.view === "summary") {
        return e("span", null, "懒人模式：梯子七阶 + 6 个中文技能（零 tool 注册）");
      }
      return e(PonytailConfigPanel, props);
    }

    function apply(ctx) {
      // 常驻落点一：侧边栏底部按钮（不依赖 settings / plugin-manager）
      ctx.slots.inject("sidebar.footer.action", function () {
        track("sidebar.footer.action");
        return ctx.slots.register(
          { name: "sidebar.footer.action", id: "ponytail", order: 10 },
          PonytailFooterButton
        );
      });

      // 常驻落点二：全局浮层面板（点击侧边栏按钮后展开完整配置）
      ctx.slots.inject("shell.overlay", function () {
        track("shell.overlay");
        return ctx.slots.register(
          { name: "shell.overlay", id: "ponytail", order: 10 },
          PonytailOverlay
        );
      });

      // 官方插件页条目（设置界面那条链）：与官方 shell / agent-loop / web-search 同款插槽。
      // 此前只挂 plugins.bundle.config，宿主不为本包 serve 配置表单时整块 UI 就没有落点。
      ctx.slots.inject("plugins.item", function () {
        track("plugins.item");
        return ctx.slots.register(
          {
            name: "plugins.item",
            id: "ponytail",
            order: 60,
            label: function () {
              return "Ponytail 懒人模式";
            },
          },
          PonytailEntry
        );
      });

      // 设置窗口一级 Tab：由 settings-general 声明，不经过 plugin-manager，
      // 是插件管理页通道不可用时的保底落点（设置窗口左侧出现本插件，右侧为完整面板）
      ctx.slots.inject("settings.section", function () {
        track("settings.section");
        return ctx.slots.register(
          {
            name: "settings.section",
            id: "ponytail",
            order: 60,
            label: function () {
              return "Ponytail 懒人模式";
            },
          },
          PonytailConfigPanel
        );
      });

      // 插件卡片详情页：内联配置面板。
      // 双 key 保险：宿主按包名匹配（已核实 listBundles 的 name 即包名），
      // 但个别宿主若以 bundle id 为键，这里同样命中；容器按 entryKey 过滤，只会渲染一份。
      for (const key of ["@wenaixi/dsh-ponytail", "ponytail"]) {
        ctx.slots.inject("plugins.bundle.config", function () {
          track("plugins.bundle.config:" + key);
          return ctx.slots.register(
            { name: "plugins.bundle.config", key: key },
            PonytailConfigPanel
          );
        });
      }
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  }
});
