import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { writeFile } from 'node:fs/promises'

/**
 * 客户端产物生成器：把 Browser 半侧写成 DSH Client Runner 可加载的 CJS factory。
 *
 * 为什么单独一个脚本而不是直接写 lib/client.js：
 * 产物必须是 `window.__ModuleLoader__.load({ id, factory })` 形态，
 * 内联在字符串模板里极易被误编辑；此处集中生成，源码只此一份。
 *
 * 迁移到官方配置组合后（本文件在 5.1.0 起）：
 * - 可持久化字段（defaultMode、disabledSkills）经 `ctx.configForms.get('ponytail')`
 *   读写，由宿主的 settings 服务落 profile 补丁，并自带 revision 冲突保护；
 * - 只读推导值（优先级诊断链、当前生效等级）经 `ctx.remote.ponytail.snapshot()` 读取；
 * - 一键重置走两条 `op:'unset'`，不再需要自制的 POST 端点。
 * 组件一律取自 @deepseek-ai/dsh-client-ui-primitives（DSH 官方组件族），
 * 与 settings-general / settings-models / plugin-manager 同源，视觉自动对齐宿主；
 * 本文件不自定义任何色值与圆角，只做布局。
 */
// ---- 构建期技能元数据提取（SKILL.md frontmatter 唯一真源，与宿侧 readSkillMeta 同源） ----
const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
function extractSkillMeta() {
  let dirs = []
  try {
    dirs = readdirSync(SKILL_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
  const metas = []
  for (const dir of dirs) {
    let description = dir
    try {
      const raw = readFileSync(join(SKILL_ROOT, dir, 'SKILL.md'), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
      if (raw.startsWith('---\n')) {
        const end = raw.indexOf('\n---\n')
        if (end > 0) {
          const fm = parseYaml(raw.slice(4, end))
          if (fm && typeof fm === 'object' && typeof fm.description === 'string') description = fm.description
        }
      }
    } catch {
      // 缺 SKILL.md 时以目录名兜底
    }
    metas.push({ id: dir, description })
  }
  return metas
}
const SKILL_META_BUILD = extractSkillMeta()
const LOCALE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'locale')
const readLocale = (name) => JSON.parse(readFileSync(join(LOCALE_ROOT, name), 'utf8'))
const ZH_BUILD = readLocale('zh.json')
const EN_BUILD = readLocale('en.json')
if (SKILL_META_BUILD.length !== 6) {
  console.error('[build-client] 技能目录应含 6 个 SKILL.md，实际 ' + SKILL_META_BUILD.length)
  process.exit(1)
}

const content = `window.__ModuleLoader__.load({
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
    var ZH = ${JSON.stringify(ZH_BUILD)};
    var EN = ${JSON.stringify(EN_BUILD)};
    // t 在 apply 时经 ctx.locale.bind 赋值；组件读取 factory 级变量（不接收 ctx，铁律）
    var localeCtx = null;
    var t = function (key, params) {
      var s = ZH[key];
      if (typeof s === "string" && params) {
        return s.replace(/\{([^}]+)\}/g, function (_, n) { return params[n] != null ? String(params[n]) : ""; });
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
    const SKILL_META = ${JSON.stringify(SKILL_META_BUILD)};

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
     * 读取官方远程命名空间的第一个方法，作为快照源。
     * 命名空间由网关按宿主服务上的 typertRemote 绑定自动安装（无 Proxy 参与），
     * 因此这里只做「取到就用、没取到就降级」，不假设它一定存在。
     */
    function createRemoteStore(ctx, namespace) {
      var store = createStore({ status: "loading", value: null });
      var method = "snapshot";
      var load = function () {
        var ns = ctx.get("remote." + namespace);
        if (ns === undefined || ns === null || typeof ns[method] !== "function") {
          store.set({ status: "unavailable", value: null });
          return;
        }
        Promise.resolve(ns[method]()).then(function (response) {
          if (response && response.ok === true) {
            store.set({ status: "ready", value: response.value });
          } else {
            store.set({ status: "unavailable", value: null });
          }
        }).catch(function () {
          store.set({ status: "unavailable", value: null });
        });
      };
      load();
      // 配置表单写入成功后由面板调用：重新拉一次服务端真值（当前等级可能已变）
      store.reload = load;
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
        props.scope.mutate(ops, snapshot.revision).then(function (landed) {
          setBusy(false);
          setNote(landed ? message : t("error.rejected"));
          // 档位写入后重新拉一次服务端真值：当前生效等级可能随之改变，
          // 而它不在 configForms 快照里（那是持久化配置，不是运行时推导值）。
          if (landed && props.reloadRemote) props.reloadRemote();
        });
      }, [props.scope, snapshot.revision]);

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
`

await writeFile('lib/client.js', content, 'utf-8')
console.log('[build-client] generated DSH-native client.js')
