# dsh-ponytail

<p align="center">
  <img src="assets/logo.png" width="180" alt="Ponytail" />
</p>

<p align="center">
  Lazy senior developer mode, ported to DeepSeek Harness.<br/>
  <em>The best code is the code you never wrote.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT"/></a>
  <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail"><img src="https://img.shields.io/npm/v/@wenaixi/dsh-ponytail?color=111111&style=flat-square" alt="npm"/></a>
</p>

<p align="center">
  <b>English</b> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/DietrichGebert/ponytail">Upstream</a> ·
  <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail">npm</a>
</p>

An always-on plugin for DeepSeek Harness (DSH): injects the 7-rung ladder directly into system prompts, provides 6 specialized skills, and registers zero tools. Ported from and inspired by [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail). Local releases are maintained independently (独立维护) with decoupled versioning (ADR-0010).

## Installation

Install into any target profile. Replace `web` with your own `--profile <name>`.

```bash
dsh plugin --profile web add @wenaixi/dsh-ponytail
dsh plugin --profile web remove @wenaixi/dsh-ponytail
dsh --profile web --dump-config | grep -A2 ponytail
```

`WARN missing peer @deepseek-ai/...` warnings are normal; peer dependencies are provided by the DSH host runtime. Seeing `Packages: +2 Done` indicates a successful install.

If the plugin card displays only the raw package name without an icon, title, or description, ensure that your package exports expose `./package.json` and `./locale/*.json`. This is a hard requirement for DSH metadata discovery.

### Installation and Hot Reload

Zero-configuration hot installation is fully supported. When `dsh plugin add` registers the package in `package.json` and the bundle list, DSH HMR automatically reloads the Loader tree and renders the configuration card:

```bash
dsh plugin --profile web add @wenaixi/dsh-ponytail@5.3.2
```

After running the command, wait 2–3 seconds for the file watcher debounce period (Chokidar `awaitWriteFinish: true`), then refresh your browser. Manual editing of `cordis.patch.yml` is neither required nor recommended.

Notes:
- Fresh installs do not require restarting the host process; a browser refresh is sufficient.
- When performing in-place upgrades of an already-installed version, host entry revision freezing applies. Restarting the host or removing and re-adding the plugin is recommended to pick up updated artifacts.

## Usage

```
/ponytail            Switch to full mode (all 7 rungs active)
/ponytail lite       Do the bare minimum
/ponytail ultra      Challenge the requirement itself first
/ponytail off        Disable injection
/ponytail default lite   Persist default across sessions
stop ponytail        Equivalent to off (exact match)
```

Intensity levels reset on each new session according to `env > Profile patch > fallback full`. Therefore, `/ponytail <level>` is session-scoped. To persist across restarts and new sessions, use `/ponytail default <level>`.

### Zero Cache Miss Architecture (Prompt Cache Friendly)

When switching intensity levels within an ongoing session or updating global default configurations, the top-level SystemPrompt baseline remains **strictly byte-identical and static**. 

Mode transitions take effect dynamically by appending an incremental system notification (`<system-reminder>`) at the end of the current turn's user message (aligned with the official `dsh-tool-skill` catalog update pattern, ADR-0012). This **100% protects historical KV Cache / Prompt Cache** across all multi-turn conversation history, eliminating costly prefill recalculations and latency spikes.

Specialized Skills beyond the 6 intensity levels:

| Skill | Description |
| --- | --- |
| `/ponytail-review` | Focus strictly on diffs; hunt for code that can be deleted |
| `/ponytail-audit` | Repo-wide over-engineering audit ranked by deletion yield |
| `/ponytail-debt` | Harvest `ponytail:` comments into an actionable debt ledger |
| `/ponytail-gain` | Minimal metrics dashboard |
| `/ponytail-help` | Quick reference card for modes, commands, and skills |

When debugging via the CLI, avoid using the keyword `headless` in your task prompt, as it may interfere with `/ponytail` prefix matching:

```bash
dsh --profile web '<your-task>'
```

## Skill Bodies and Description Languages

Skill bodies are retrieved directly from upstream DietrichGebert/ponytail v4.10.3 in verbatim English. Two host-incompatible details are tailored for DSH: `ponytail-gain` data sources point to `assets/*.svg` (as upstream `benchmarks/` is excluded), and `ponytail-help` configuration and update sections reference profile patches and `dsh plugin`.

Model catalog views and configuration forms share the exact same description string, governed by `skillDescriptionLang` (three-state: explicit Chinese `zh` / explicit English `en` / unconfigured `auto`). When unconfigured, it follows the host's `locale.preference` (English triggers English alignment; others default to Chinese). Explicit selection locks the language. Canonical descriptions reside in `skills/descriptions.zh.json` and `skills/descriptions.en.json`, served live via `ctx.remote.ponytail.snapshot()`.

Catalog descriptions are constrained to the official 500-character ceiling (`dsh-tool-skill`). Longer descriptions will be truncated with `...` in the model catalog; static gates in `verify.mjs` enforce this boundary across both languages.

## Configuration Panel

The card detail view provides an embedded settings panel: intensity level control, independent toggle switches for all 6 skills, a one-click reset button, and a 3-tier priority diagnostic chain displaying environment variables, profile patches, and built-in fallbacks with their active hit states.

The level segmented control reflects only the actual persisted configuration. When `defaultMode` is not configured in the patch, the control highlights the appended `unset` segment. The currently active runtime level is displayed distinctly in the diagnostic header text.

Configuration reads and writes use two official DSH channels:

| Channel | Scope | Target |
| --- | --- | --- |
| `ctx.configForms.get('ponytail')` | Default level & disabled skills with revision conflict checking | `profiles/<name>/cordis.patch.yml` |
| `ctx.remote.ponytail.snapshot()` | Active runtime level & 3-tier diagnostic chain (read-only) | In-memory RPC |

Profiles lacking a full UI service bundle (headless, CLI) fall back gracefully to `profiles/<name>/ponytail/config.json`. Legacy configurations from `$DSH_HOME/ponytail/config.json` are migrated once into profile patches upon initial boot and renamed to `.imported`.

## Installation, Upgrade, and Removal Lifecycle

| Action | Host Restart Required | Reason |
| --- | --- | --- |
| Fresh Install | No (browser refresh only) | Host detects newly registered entries and pushes new revision hashes |
| Upgrade | Yes | Host entry revisions are frozen at process startup; in-place file replacement does not trigger hash updates |
| Removal | No (patch entry cleaned manually) | `dsh plugin remove` cleans `package.json`, bundle registries, and physical modules, leaving patch entries untouched |

Residual entries after uninstallation log a non-fatal warning (`patch: entry "ponytail" not found`). This does not prevent host startup.

## Upstream Mapping

The six hooks from upstream `hooks/` are consolidated into a single DSH Cordis plugin:

| Upstream | DSH Implementation |
| --- | --- |
| `ponytail-config.js` | `src/ponytail-config.ts` |
| `ponytail-instructions.js` | `src/ponytail-instructions.ts` (single出口 `renderPromptSection`) |
| `ponytail-state.js` | `src/ponytail-state.ts` (flag file I/O, session baseline manager, reload) |
| `ponytail-activate.js` | `src/ponytail.ts` (`agent/created` hook) |
| `ponytail-mode-tracker.js` | `src/ponytail-commands.ts` (`createCommandDispatcher`) |
| `ponytail-subagent.js` | `src/ponytail.ts` (`agent/created`, `PONYTAIL_SUBAGENT_MATCHER`) |

Prompts are injected via `systemPrompt.section('ponytail')` at `order: 50`, positioned neatly between `persona` (0) and tools (100). When switched to `off`, prompt rendering overhead is zero. Flags and configurations are scoped per profile directory, ensuring full multi-instance isolation.

## Development

```bash
pnpm typecheck              # tsc --noEmit
pnpm build                  # tsc into lib/, scripts/build-client.mjs generates lib/client.js
node scripts/verify.mjs     # Static contract gates: artifacts, skills, zero tools, slots, locales
node scripts/docs-verify.mjs # Documentation and version consistency gates
node scripts/behavior.test.mjs  # Behavioral test suite (102 tests pass)

dsh --profile web --patch ./cordis.patch.yml --dump-config  # Verify patch parsing
pnpm dsh web --patch ./cordis.patch.yml   # Hot reload dev runner
```

Local releases follow standard SemVer. Releases are triggered exclusively via git tags in CI. Push and tag operations require explicit authorization.

## License

[MIT](LICENSE), original by DietrichGebert, DSH port by Wenaixi. Upstream repository: https://github.com/DietrichGebert/ponytail
