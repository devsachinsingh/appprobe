# AppProbe

> AI-powered mobile project scanner. Scans legacy iOS & Android codebases and writes `skill.md` context files so AI-native IDEs like Claude Code, Cursor, and Windsurf understand your project before touching it.

[![npm version](https://img.shields.io/npm/v/appprobe.svg)](https://www.npmjs.com/package/appprobe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## The problem

You have a old iOS or Android project. You want to add a new module using Claude Code or Cursor. But the AI has no idea:

- That you use Alamofire 4 (not 5), and the patterns are different
- That Firebase Crashlytics replaced the old Fabric SDK halfway through
- That there are hardcoded API keys in `NetworkConstants.swift`
- That the project uses VIPER, not MVVM — so new screens need a Router
- That `AsyncTask` is all over the Android side and shouldn't be replicated

**AppProbe scans your project and writes all of this down** in structured `skill.md` files that AI assistants read automatically.

---

## Quick start

```bash
# No install needed — just run
npx appprobe scan ./MyLegacyApp

# Or install globally
npm install -g appprobe
appprobe scan ./MyLegacyApp
```

Requires `ANTHROPIC_API_KEY` in your environment. If you're inside **Claude Code or Cursor**, the key is inherited automatically — no setup needed.

---

## What gets generated

```
MyLegacyApp/
├── ai-context/
│   └── skills/
│       ├── service-calling.skill.md      ← networking rules & patterns
│       ├── third-party.skill.md          ← SDK inventory & deprecations
│       ├── code-practices.skill.md       ← Swift/Kotlin idioms & antipatterns
│       ├── architecture.skill.md         ← detected pattern, separation rules
│       ├── security.skill.md             ← secrets, storage, cert pinning
│       └── project-health-report.md      ← health score, gap list
└── CLAUDE.md                             ← auto-updated to reference skill files
```

Claude Code, Cursor, Windsurf, and Codex all read `CLAUDE.md` at the project root — so any AI session opened in this project will have full context immediately.

---

## How it works

```
npx appprobe scan ./MyLegacyApp
         │
         ▼
  ┌─────────────────────────────┐
  │  1. Platform detection      │  Finds iOS/Android/both from project files
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────┐
  │  2. Static scanners (x5)    │  Zero AI cost — fast regex + AST pattern matching
  │  • Service calling          │
  │  • Third-party integrations │
  │  • Code practices           │
  │  • Architecture             │
  │  • Security                 │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────┐
  │  3. Claude API (5 calls)    │  One call per skill — reasons about findings,
  │                             │  writes contextual skill.md content
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────┐
  │  4. Output writer           │  Writes skill files, gap report, updates CLAUDE.md
  └─────────────────────────────┘
```

**AI cost is predictable**: 5–6 Claude API calls per full scan regardless of project size. The static scanner does all the heavy lifting first.

---

## CLI reference

### `appprobe scan`

```bash
appprobe scan [projectPath] [options]

Arguments:
  projectPath              Path to mobile project root (default: current directory)

Options:
  -p, --platform <name>    Force platform: ios | android | both
  -s, --skills <list>      Comma-separated skills to run (default: all)
                           service-calling,third-party,code-practices,architecture,security
  -o, --output <dir>       Output directory (default: <project>/ai-context/skills)
  -k, --api-key <key>      Anthropic API key (default: $ANTHROPIC_API_KEY)
  --no-ai                  Static scan only — no AI, no skill.md written
  -v, --verbose            Verbose output
  -h, --help               Show help
```

**Examples:**

```bash
# Scan current directory
npx appprobe scan

# Scan specific path, iOS only
npx appprobe scan ~/projects/MyApp --platform ios

# Run only security and third-party scans
npx appprobe scan . --skills security,third-party

# Static scan only (no API key needed)
npx appprobe scan . --no-ai

# Custom output directory
npx appprobe scan . --output ./docs/ai-context
```

### `appprobe init`

Adds an AppProbe slash command to Claude Code:

```bash
appprobe init [projectPath]
```

After running this, open your project in Claude Code and type `/appprobe` to trigger a scan directly from the IDE.

---

## Skill scanners

### Service calling
Detects networking libraries and patterns:
- **iOS**: Alamofire (version, deprecated `.responseJSON`, force-try on decode), `URLSession.shared` singleton, plain HTTP URLs, callback-based vs async/await
- **Android**: Retrofit, OkHttp, synchronous `.execute()` calls, deprecated `AsyncTask + HttpURLConnection`, Gson vs Moshi

### Third-party integrations
Inventories all SDKs and flags:
- Deprecated SDKs (Fabric/Crashlytics → Firebase, Picasso → Coil)
- SDKs with known breaking version changes (Firebase v9+, Facebook SDK v14+)
- Outdated patterns that won't work with modern versions

### Code practices
Language-specific antipatterns:
- **Swift**: force unwraps (`!`), force casts (`as!`), `URLSession.shared`, retain cycles, `DispatchQueue.main.sync`, deprecated UIKit APIs, Storyboard usage
- **Kotlin**: `!!` operator, `lateinit var`, `GlobalScope`, `runBlocking`, `Thread.sleep`, deprecated `AsyncTask`, `startActivityForResult`

### Architecture
Detects the dominant pattern (MVC / MVVM / VIPER / Clean / MVI) and flags:
- Business logic in ViewControllers / Activities
- Network calls in the UI layer
- Singleton overuse
- Missing dependency injection
- Files over 300/500 lines (massive component smell)

### Security
- Hardcoded API keys, passwords, AWS credentials
- Sensitive data in `UserDefaults` / `SharedPreferences`
- Sensitive data in logs (`NSLog`, `Log.d`)
- SSL certificate validation disabled
- Missing certificate pinning
- `android:debuggable=true` in release manifest
- `android:allowBackup=true`
- Insecure Keychain accessibility attributes

---

## Claude Code integration

After running `appprobe init`, a slash command is added to `.claude/commands/appprobe.md`.

Inside Claude Code, type:

```
/appprobe
```

Claude will run the scan and tell you what it found — without leaving your IDE.

AppProbe also automatically updates `CLAUDE.md` after every scan, so every new Claude Code session for this project starts with full skill context.

---

## Example output

```
  ╔═══════════════════════════════════════╗
  ║   AppProbe v1.0.0                     ║
  ║   Mobile project scanner for AI IDEs  ║
  ╚═══════════════════════════════════════╝

  ✔ Scan complete!

  Project health
  Score : 61/100
  Grade : C
  Platform detected: both

  Skill scores
  service-calling      ████████░░ 78/100
  third-party          ██████░░░░ 55/100
  code-practices       ███████░░░ 70/100
  architecture         ██████░░░░ 60/100
  security             ████░░░░░░ 42/100

  Output
  /Users/dev/MyApp/ai-context/skills
  5 skill files + 1 health report + CLAUDE.md updated

  Tip: Open this project in Claude Code or Cursor.
  AI assistants will automatically pick up the generated skill files.
```

---

## Requirements

- **Node.js** >= 18
- **Anthropic API key** — set `ANTHROPIC_API_KEY` in your environment
  - Not needed if running inside Claude Code or Cursor (inherited automatically)
  - Not needed for `--no-ai` static-only scans

---

## Roadmap

| Version | What's coming |
|---------|--------------|
| v1.0 | 5 curated skill scanners, iOS + Android, npm |
| v1.1 | `--live-docs` flag — fetches SDK changelogs to catch deprecations in real time |
| v1.2 | Dependency management skill (SPM, CocoaPods, Gradle version catalogs) |
| v2.0 | Plugin API — write your own skill scanner as `appprobe-plugin-*` on npm |

---

## Contributing

AppProbe is MIT licensed and open to contributions.

```bash
git clone https://github.com/appprobe/appprobe.git
cd appprobe
npm install
npm run build
node packages/cli/dist/cli.js scan ./your-test-project
```

To add a new detection rule, open the relevant scanner file in `packages/skills/src/` and add an entry to the patterns array. No framework knowledge needed — just a regex and a description.

---

## License

MIT © AppProbe contributors
