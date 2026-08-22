# dsh-ponytail

<p align="center">
  <img src="assets/logo.png" width="180" alt="Ponytail" />
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

## 📦 Skills

| Skill | Type | Notes |
|---|---|---|
| `ponytail` | skill + always-on | 7-rung ladder, 3 intensities, CN/EN triggers |
| `ponytail-review` | skill | diff review, `delete/stdlib/native/yagni/shrink` |
| `ponytail-audit` | skill | repo-wide audit, same tags, ranked |
| `ponytail-debt` | skill | harvest `ponytail:` comments |
| `ponytail-gain` | skill | scoreboard (benchmark medians) |
| `ponytail-help` | skill | quick reference |

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

## 🎮 Usage

- Active by default on every coding turn. Explicit: `/ponytail [lite|full|ultra|off]`, `/ponytail default <mode>`, `/ponytail-review` etc.
- One-shot skills: `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help`
- Deactivate: `stop ponytail` / `normal mode` (whole sentence) or `/ponytail off`
- Subagents: `PONYTAIL_SUBAGENT_MATCHER` regex, same as upstream

## 🛠️ Dev

```bash
pnpm typecheck && pnpm build && node scripts/verify.mjs
dsh --profile web --patch ./cordis.patch.yml --dump-config
pnpm dsh web --patch ./cordis.patch.yml
```

## 📄 License

[MIT](LICENSE) © DietrichGebert / Wenaixi