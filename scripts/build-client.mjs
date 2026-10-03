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
      { value: "off", label: "关闭" },
      { value: "lite", label: "轻量" },
      { value: "full", label: "标准" },
      { value: "ultra", label: "激进" },
    ];


    // 技能元数据从 SKILL.md frontmatter 提取（唯一真源，与宿侧 readSkillMeta 同源）
    const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
    const SKILL_META = ${JSON.stringify(SKILL_META_BUILD)};

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

    function apply(ctx) {
      // 插件卡片详情页：内联配置面板（keyed by 包名，已核实宿主 listBundles 的 name 即包名）
      ctx.slots.inject("plugins.bundle.config", function () {
        return ctx.slots.register(
          { name: "plugins.bundle.config", key: "@wenaixi/dsh-ponytail" },
          PonytailConfigPanel
        );
      });
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  }
});
`

await writeFile('lib/client.js', content, 'utf-8')
console.log('[build-client] generated DSH-native client.js')
