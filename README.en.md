# dsh-ponytail

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Wenaixi/dsh-ponytail/main/assets/logo-dark.png">
    <img src="https://raw.githubusercontent.com/Wenaixi/dsh-ponytail/main/assets/logo.png" width="180" alt="Ponytail" />
  </picture>
</p>

<p align="center">
  <strong>The Lazy Senior — ported to DeepSeek Harness</strong><br/>
  <em>The best code is the code you never wrote.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT"/></a>
  <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail"><img src="https://img.shields.io/npm/v/@wenaixi/dsh-ponytail?color=111111&style=flat-square" alt="npm"/></a>
  <img src="https://img.shields.io/badge/version-4.9.0-111111?style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/DSH-0.1.1--rc.2-333333?style=flat-square" alt="DSH"/>
  <img src="https://img.shields.io/badge/skills-6-008080?style=flat-square" alt="skills"/>
  <img src="https://img.shields.io/badge/node-%3E%3D18-3C873A?style=flat-square" alt="node"/>
</p>

<p align="center">
  <a href="README.md">中文</a> · English · <a href="CHANGELOG.md">Changelog</a> · <a href="https://github.com/DietrichGebert/ponytail">Upstream</a> · <a href="https://www.npmjs.com/package/@wenaixi/dsh-ponytail">npm</a>
</p>

---

> A complete DSH port of [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) v4.9.0.
> Brings the "lazy senior dev" into DeepSeek Harness: always-on ladder injection + 6 localized skills, no empty tools.

## ✨ Features

- **Always-on ladder**: 7-rung decision (YAGNI → reuse → stdlib → platform native → installed dep → one-liner → minimal), auto-injected before every model request, silent when `off`.
- **6 localized skills**: `ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` / `ponytail-gain` / `ponytail-help`, `rank: 550` so project layers can override.
- **Three intensities**: `lite` / `full` (default) / `ultra`.
- **Upstream-faithful behavior**: `PONYTAIL_DEFAULT_MODE` env > cordis config > config file > `full`; `review` not allowed as default; whole-sentence deactivation; `ponytail:` debt ledger; `PONYTAIL_SUBAGENT_MATCHER` filtering.
- **No empty tools**: no `ctx.tools` placeholder — everything via `ctx.skills`.

---

## 🪜 What is “The Ladder”

> **Ladder = decision ladder.** It doesn't make the model talk less — it makes it **stop at the first rung that holds** *before* writing any code. The higher the rung, the less code; only step down when the higher one doesn't hold.

```
1. Does this need to exist?   → No: skip (YAGNI), one-line reason
2. Already in this codebase?  → Reuse existing helper / util / pattern
3. Stdlib does it?            → Use stdlib
4. Native platform feature?   → Use native (<input type=date> over a picker lib)
5. Installed dependency?      → Use what's already installed, never add one for a few lines
6. One line?                  → One line
7. Only then: the minimum     → The shortest working diff
```

| Rung | Name | Meaning | Example |
|---|---|---|---|
| 1 | YAGNI | Don't build what you don't need | "Add a config center?" → "Not needed, YAGNI" |
| 2 | Reuse | Find it first | `formatDate` already exists — don't write another |
| 3 | Stdlib | Use the stdlib | `path.join` over manual string concat |
| 4 | Native | Use platform | `<input type="date">` over `flatpickr` |
| 5 | Installed dep | Use what's installed | Already have `dayjs` → don't add `moment` |
| 6 | One-liner | One line if you can | `arr.filter(Boolean)` |
| 7 | Minimal | Only here write new code | Shortest diff that works |

**Key rule**: the ladder runs *after* understanding the problem, not instead of it. Trace the real call chain first, then climb. Bug fixes fix the root — one guard in the shared function beats a guard in every caller.

Intensities:

| Level | Behavior |
|---|---|
| `lite` | Build what's asked, name the lazier alternative in one line |
| `full` (default) | Enforce the ladder, stdlib/native first |
| `ultra` | Extreme YAGNI — challenge the requirement, then ship the one-liner |

---

## 🪝 Hook Injection Deep Dive

> Upstream ponytail injects via `hooks/` for Claude Code / Codex / Copilot / Qoder. This port merges all 4 lifecycle hooks into a single DSH plugin — no host hook config needed.

### Upstream → DSH Mapping

| Upstream | Responsibility | DSH side |
|---|---|---|
| `ponytail-config.js` | `env > file > full`, `review` not allowed as default, BOM / allowlist | `src/ponytail-config.ts` |
| `ponytail-instructions.js` | Slice `SKILL.md` by `lite/full/ultra`, `review` standalone | `src/ponytail-instructions.ts` + CN fallback |
| `ponytail-runtime.js` | `.ponytail-active` flag + 3-platform detection | `src/ponytail-runtime.ts` |
| `ponytail-activate.js` + `mode-tracker.js` + `subagent.js` | SessionStart, UserPromptSubmit, SubagentStart | `src/ponytail.ts` unified |

### Injection Pipeline

```
Startup: env PONYTAIL_DEFAULT_MODE
          → cordis config defaultMode
          → config file ~/.config/ponytail/config.json
          → fallback full
          → setMode(flag file) + ctx.logger

Before every model request:
  agent/pre-step (waterfall, must return next())
    ├─ Parse payload.messages text
    ├─ Match /ponytail family / stop ponytail → switch currentMode + write flag
    └─ next() to continue

  systemPrompt:section { name: ponytail, order: 50 }
    ├─ order 50 sits after persona(0), before tool guidance(100)
    ├─ Synchronously read skills/ponytail/SKILL.md → slice by currentMode
    ├─ off → empty string (silent)
    ├─ review → pointer to /ponytail-review skill
    ├─ fallback → CN built-in instruction on read failure
    └─ Re-sync via readMode() vs currentMode before each assembly (cross-process)

Persistence:
  /ponytail default <mode> → writeDefaultMode() → config.json
  Subagents: PONYTAIL_SUBAGENT_MATCHER regex (warn on invalid, fallback to no filter),
             all agents share the same section on DSH — log-only distinction

HMR:
  Everything via ctx (registerProvider / section / on / effect),
  auto-cleaned in reverse order on hot reload — no residue.
```

**Why `systemPrompt` over `agent.inject`?**
- Logged and replayable — satisfies "model-visible is durable" invariant;
- `order: 50` puts the constraint after the persona but before tool docs, so the model sees it first;
- `text` is a function, evaluated on every `assemble`; zero cost when `off`.

Flag file (upstream-compatible, cross-process):

```
CLAUDE_PLUGIN_ROOT contains agent-plugins + .vscode  → VS Code Copilot
PLUGIN_DATA                                      → Codex
QODER_SESSION_ID                                 → Qoder
otherwise                                        → ~/.claude / $CLAUDE_CONFIG_DIR
```

---

## 📦 Skills

| Skill | Type | Notes |
|---|---|---|
| `ponytail` | skill + always-on | 7-rung ladder, 3 intensities, CN/EN triggers |
| `ponytail-review` | skill | diff review, `delete/stdlib/native/yagni/shrink` |
| `ponytail-audit` | skill | repo-wide audit, same tags, ranked |
| `ponytail-debt` | skill | harvest `ponytail:` comments |
| `ponytail-gain` | skill | scoreboard (benchmark medians) |
| `ponytail-help` | skill | quick reference |

---

## 🚀 Install

> Default target is `web` (your daily DSH Web UI on :3080). `demo` in examples is just a placeholder — replace with any `--profile <name>`.

### npm (recommended)

```bash
# As a DSH plugin (via dsh.bundle, takes effect on next web start — no need to restart :3080 manually)
dsh plugin --profile web add @wenaixi/dsh-ponytail
npm i @wenaixi/dsh-ponytail
pnpm add @wenaixi/dsh-ponytail
```

> `WARN missing peer @deepseek-ai/...` is expected: those peers are provided by the DSH runtime. `Packages: +2 Done` means success.

### GitHub (no build, lib committed)

```bash
dsh plugin --profile web add github:Wenaixi/dsh-ponytail
dsh plugin --profile web add github:Wenaixi/dsh-ponytail#v4.9.0
```

### Local / tarball

```bash
pnpm install && pnpm build
dsh plugin --profile web add ./
pnpm pack && dsh plugin --profile web add ./wenaixi-dsh-ponytail-4.9.0.tgz
```

Remove:

```bash
dsh plugin --profile web remove @wenaixi/dsh-ponytail
```

Verify (no restart of :3080):

```bash
pnpm build && pnpm typecheck && node scripts/verify.mjs
dsh --profile web --dump-config | grep -A2 ponytail
```

---

## ⚙️ Configure

```yaml
- insert:
    - id: ponytail
      name: "@wenaixi/dsh-ponytail"
      config:
        providerName: ponytail
        skillDir: /path/to/skills
        defaultMode: full   # off|lite|full|ultra
```

Priority: `PONYTAIL_DEFAULT_MODE` env > explicit cordis `defaultMode` > `~/.config/ponytail/config.json` (`%APPDATA%` on Windows, `XDG_CONFIG_HOME` wins) > `full`. `/ponytail default <mode>` persists to that file.

---

## 🎮 Usage

- Active by default on every coding turn. Explicit: `/ponytail [lite|full|ultra|off]`, `/ponytail default <mode>`, `/ponytail-review` etc.
- One-shot skills: `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help`
- Deactivate: `stop ponytail` / `normal mode` (whole sentence) or `/ponytail off`
- Subagents: `PONYTAIL_SUBAGENT_MATCHER` regex, same as upstream

---

## 🛠️ Dev

```bash
pnpm typecheck && pnpm build && node scripts/verify.mjs
dsh --profile web --patch ./cordis.patch.yml --dump-config
pnpm dsh web --patch ./cordis.patch.yml
```

---

## 📄 License

[MIT](LICENSE) © DietrichGebert / Wenaixi
