# AppProbe

> You open a 5-year-old iOS or Android project in Claude Code. The AI has no idea what it's looking at. It writes modern Swift. Your project is UIKit + Alamofire 4 + half-migrated Fabric SDK. Nothing compiles. Two hours lost. **AppProbe fixes this.**

[![npm version](https://img.shields.io/npm/v/appprobe.svg)](https://www.npmjs.com/package/appprobe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## The real problem

AI coding assistants are brilliant on greenfield projects. On legacy projects, they're dangerous.

When you open an old mobile project in Claude Code, Cursor, or Windsurf — the AI walks in completely blind. It doesn't know:

- Your project uses **Alamofire 4**, not 5 — and the response handler API is completely different
- There's a **half-finished migration** from Fabric Crashlytics to Firebase that was never completed
- Someone hardcoded **API keys in NetworkConstants.swift** three years ago and nobody cleaned it up
- The whole app is **VIPER**, so every new screen needs a Router and Wireframe — not just a ViewModel
- The Android side is still **70% Java** with AsyncTask everywhere — a pattern that was deprecated in API 30
- Tokens are stored in **UserDefaults** (they shouldn't be) and that pattern must not be repeated

So the AI does what any confident person does when they don't know something — it makes educated guesses based on what's modern and popular. The result: code that looks clean, doesn't match your project, replicates the bad patterns, and sometimes makes things worse.

**This is happening every day, in every team, on every mobile project older than 3 years.**

---

## What AppProbe does

AppProbe scans your legacy mobile project and writes **`skill.md` context files** — structured documents that tell AI assistants exactly what they're dealing with before they write a single line.

```bash
npx appprobe scan .
```

That one command:

1. **Detects your platform** — iOS, Android, or both. Finds Podfile, build.gradle, Package.swift, xcworkspace automatically
2. **Runs 5 static scanners** — zero AI cost, instant. Finds every library, pattern, antipattern, deprecated API, and hardcoded secret across your entire codebase
3. **Calls Claude AI once per skill** — reasons about what it found, writes opinionated context files that an AI assistant can actually use
4. **Writes everything to `ai-context/skills/`** — right at your project root where Claude Code, Cursor, and Windsurf pick it up automatically
5. **Updates your `CLAUDE.md`** — so every future AI session in this project starts with full context. No setup, no reminders needed

---

## Quick start

```bash
# No install needed
npx appprobe scan ./MyLegacyApp

# Inside Claude Code or Cursor — API key is already inherited
npx appprobe scan .

# Install globally if you prefer
npm install -g appprobe
appprobe scan .
```

Requires `ANTHROPIC_API_KEY`. If you're inside **Claude Code, Cursor, Windsurf, or Codex** — the key is already in your environment. Nothing to configure.

---

## What gets written

```
MyLegacyApp/
├── ai-context/
│   └── skills/
│       ├── service-calling.skill.md     ← "Use AF.request only through NetworkManager,
│       │                                    never directly. .responseJSON is deprecated."
│       ├── third-party.skill.md         ← "Fabric SDK found — fully deprecated since 2020.
│       │                                    Firebase Crashlytics migration is incomplete."
│       ├── code-practices.skill.md      ← "14 force unwraps found. No async/await yet.
│       │                                    Project is UIKit, no SwiftUI."
│       ├── architecture.skill.md        ← "This is VIPER. Every new screen needs:
│       │                                    View, Interactor, Presenter, Entity, Router."
│       ├── security.skill.md            ← "3 hardcoded API keys. Tokens in UserDefaults.
│       │                                    No certificate pinning."
│       └── project-health-report.md     ← Health score, grade, full gap list
└── CLAUDE.md                            ← Auto-updated. AI reads this on every session.
```

The next time you or a teammate opens this project in any AI-native IDE and asks it to add a feature — it already knows all of this. Without you saying anything.

---

## What each scanner finds

### Service calling
The way your app talks to the network is unique to your project. AppProbe captures it exactly.

**iOS** — Detects Alamofire version and usage patterns, flags deprecated `.responseJSON` (Alamofire 5+ uses `.responseDecodable`), finds `URLSession.shared` singletons that can't be unit tested, catches force-try on JSON decoding that will crash in production, identifies callback-based networking that should be migrated to async/await

**Android** — Detects Retrofit and OkHttp, finds synchronous `.execute()` calls that freeze the UI if run on the main thread, flags deprecated `AsyncTask + HttpURLConnection` combos, identifies RxJava patterns and suggests Kotlin Coroutines as the migration path

### Third-party integrations
Every SDK in your project has a version, and some of those versions have been deprecated, renamed, or broken by updates. AppProbe knows the history.

Checks 15+ SDKs including Firebase (Analytics, Crashlytics, Realtime DB), Facebook SDK, Mixpanel, Lottie, SDWebImage, Kingfisher, Glide, Picasso, RxJava, SwiftyJSON and more. Flags deprecated SDKs (Fabric → Firebase), surfaces breaking version changes (Firebase v9+ initialization, Facebook SDK v14+ privacy requirements), and suggests modern replacements (Picasso → Coil, SwiftyJSON → Codable)

### Code practices
Language-specific antipatterns that accumulate over years and get replicated by AI assistants that don't know better.

**Swift** — Force unwraps (`!`), force casts (`as!`), `DispatchQueue.main.sync` deadlock risk, `NotificationCenter` observers never removed (memory leaks), deprecated `UIApplication.openURL`, Storyboard usage, `UIViewController` business logic

**Kotlin** — Non-null assertion (`!!`), `lateinit var` misuse, `GlobalScope` coroutines that leak on rotation, `runBlocking` on unknown threads, `Thread.sleep`, deprecated `AsyncTask`, `startActivityForResult`, `onRequestPermissionsResult`

### Architecture
AI assistants write code that matches the pattern they assume you're using. If they're wrong, the new module doesn't fit anything around it.

Detects VIPER, MVVM, MVI, Clean Architecture, and MVC. Flags business logic living in ViewControllers or Activities, network calls made directly in the UI layer, singletons used in place of dependency injection, files over 300 lines (massive component smell), and missing abstraction layers

### Security
These are the problems you really don't want an AI to accidentally replicate in new code.

Finds hardcoded API keys, passwords, and AWS credentials in source files, tokens stored in `UserDefaults` or unencrypted `SharedPreferences`, sensitive data printed to logs (`NSLog`, `Log.d`), SSL certificate validation disabled, hostname verification bypassed, `android:debuggable=true` in release manifests, `android:allowBackup=true`, and insecure Keychain accessibility attributes. Also checks for the presence (or absence) of certificate pinning.

---

## Claude Code integration

Add AppProbe as a slash command so you can trigger it from inside Claude Code without opening a terminal:

```bash
npx appprobe init .
```

This writes `.claude/commands/appprobe.md`. Now inside any Claude Code session for this project:

```
/appprobe
```

Claude runs the scan, reports findings in the chat, and the skill files are updated — without you leaving the IDE.

---

## CLI reference

```bash
appprobe scan [projectPath] [options]

Options:
  -p, --platform <n>    Force platform: ios | android | both
  -s, --skills <list>   Comma-separated skills to run (default: all)
  -o, --output <dir>    Output directory (default: <project>/ai-context/skills)
  -k, --api-key <key>   Anthropic API key (default: $ANTHROPIC_API_KEY)
  --no-ai               Static scan only — no AI, no skill.md files written
  -v, --verbose         Verbose output
```

```bash
# Scan current directory
npx appprobe scan

# iOS only, security and networking only
npx appprobe scan . --platform ios --skills security,service-calling

# Static scan only — no API key needed, no skill.md written, just findings
npx appprobe scan . --no-ai

# Custom output location
npx appprobe scan . --output ./docs/ai-context

# Add Claude Code slash command
npx appprobe init .
```

---

## When to re-run

AppProbe is not a one-time thing. Re-run it when:

- You add or upgrade a major dependency
- You start a new architectural layer (switching from MVC to MVVM, adding a DI framework)
- A new developer joins the team and asks "what's the pattern here?"
- You're about to let an AI assistant touch a sensitive area (networking, auth, payments)
- 3–6 months have passed and SDKs may have released breaking updates

```bash
# Re-run just the skills that changed
npx appprobe scan . --skills third-party,architecture
```

---

## Roadmap

| Version | What's coming |
|---------|--------------|
| **v1.0** | 5 curated skill scanners · iOS + Android · npm |
| **v1.1** | `--live-docs` flag — fetches live SDK changelogs to catch deprecations that happened after your last scan |
| **v1.2** | Dependency management skill — SPM, CocoaPods, Gradle version catalogs, outdated lockfiles |
| **v2.0** | Plugin API — write your own skill scanner as `appprobe-plugin-*` on npm |

---

## Contributing

AppProbe gets better every time someone adds a detection rule for a pattern they've actually seen in a real legacy project. The best contributions come from real pain.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add rules, scanners, and more.

---

## License

MIT © AppProbe contributors
