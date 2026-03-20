# Contributing to AppProbe

First — thank you. AppProbe only gets better when people who have actually worked on legacy mobile projects share what they've seen. Every detection rule in this repo came from a real pain point someone experienced on a real codebase.

If you've ever spent hours cleaning up what an AI assistant generated because it didn't understand your project's history — you're exactly who we built this for, and you're exactly who should be contributing.

---

## Ways to contribute

You don't need to write code to make AppProbe better. Here's what helps most:

| Contribution | Why it matters |
|---|---|
| Refine an existing rule's `detail` text | Better AI guidance for every user who hits this rule |
| Tighten a regex to reduce false positives | Bad rules erode trust faster than missing rules |
| Add a new detection rule | Every rule helps every user with that pattern |
| Add Flutter or React Native coverage | Entire ecosystem currently uncovered |
| Report a false positive | Opens a fix immediately |
| Share a real legacy project pattern | Opens a discussion that becomes a rule |
| Add a new skill scanner | New category of coverage for everyone |
| Improve an AI prompt | Better skill.md output for every scan |
| Add a test fixture | Lets others verify rules without a real project |

---

## Setup

```bash
git clone https://github.com/appprobe/appprobe.git
cd appprobe
npm install
npm run build
```

Test against a real project or a fixture:

```bash
# against a real project
node packages/cli/dist/cli.js scan ~/path/to/your/old/app

# static only — no API key needed when testing rules
node packages/cli/dist/cli.js scan ~/path/to/your/old/app --no-ai
```

---

## Refining existing rules

This is the lowest-barrier contribution and one of the most valuable. The static patterns are already written — but the `detail` text that goes into skill.md files, the severity assignments, and the regex precision all need real-world refinement as people run AppProbe on actual projects.

### Improving `detail` text

The `detail` field is not a lint warning for a human to read and dismiss. It is literally inserted into the skill.md file that Claude Code, Cursor, and Windsurf read on every session. If it's vague, the AI gets vague guidance. If it's specific and actionable, the AI writes better code.

```typescript
// What a first-pass rule looks like — technically correct, not very useful
detail: 'URLSession.shared should not be used directly.'

// What a refined rule looks like — tells the AI exactly what to do instead
detail: 'URLSession.shared is a singleton that cannot be injected or mocked in tests.
         In this project, all network calls go through NetworkManager which wraps a
         configurable URLSession instance. Use NetworkManager.shared.request() instead,
         or inject a NetworkManager in the class initializer for testable code.'
```

The best refinements come from people who hit a rule on a real project and know the actual fix. If AppProbe flagged something and you resolved it — update the detail text to describe exactly what you did. Open a PR with the change. No build changes, no new dependencies — just text.

### Tightening regex patterns

Some rules fire too broadly. If you find a rule producing noise in a real project, tighten the regex and open a PR. Always test both sides — the pattern should fire on the bad code and stay silent on the correct version:

```bash
npm run build
node packages/cli/dist/cli.js scan ./test-fixtures/your-fixture --no-ai --skills code-practices
```

Include both cases in your PR description: what it now correctly catches, and what it now correctly ignores.

### Adjusting severity

Severity affects the health score and how prominently a finding appears in the gap report. If a rule is marked `critical` but is a minor style issue in practice — or `info` when it should block AI from touching that area — open a PR adjusting it with a note explaining the reasoning.

PR commit format for refinements:
```
refine(service-calling): improve URLSession.shared detail text with project-specific guidance
refine(security): tighten API key regex to avoid false positive on config keys
refine(code-practices): promote force-cast from warning to critical
```

---

## Adding a detection rule

If you've seen a bad pattern in a legacy mobile project that an AI assistant would replicate without warning — add it.

### Step 1 — Find the right scanner

```
packages/skills/src/
├── service-calling/scanner.ts   ← Alamofire, URLSession, Retrofit, OkHttp, Dio, http, fetch, axios
├── third-party/scanner.ts       ← Firebase, Facebook SDK, Lottie, Glide, pub.dev packages, npm packages
├── code-practices/scanner.ts    ← Swift/Kotlin/Dart/JS/TS language antipatterns
├── architecture/scanner.ts      ← MVC/MVVM/VIPER/BLoC violations, massive files
└── security/scanner.ts          ← Hardcoded secrets, insecure storage, SSL
```

### Step 2 — Add your rule to the patterns array

```typescript
{
  pattern: /your-regex-here/,
  title: 'Short, clear title — what was found',
  detail: 'Why this is a problem and exactly how to fix it. Be specific. This text goes directly into the skill.md file that an AI assistant will read.',
  severity: 'critical' | 'warning' | 'info',
  category: 'your-category-slug',
}
```

**Severity guide:**
- `critical` — will crash, is a security hole, or is deprecated and broken. The AI must not replicate this pattern
- `warning` — bad practice that compounds when AI adds more code following the same pattern
- `info` — not wrong, but important AI context (e.g. "this project uses callbacks, not async/await — match that style")

### Step 3 — Test it

```bash
npm run build
node packages/cli/dist/cli.js scan ./your-test-project --no-ai --skills code-practices
```

### Step 4 — Open a PR

```
feat(code-practices): detect DispatchQueue.main.sync deadlock risk
feat(security): detect Firebase API key in Info.plist
feat(third-party): flag Picasso as maintenance-mode, suggest Coil
```

Include in your PR description: **where you actually saw this pattern** — type of project, approximate age, framework version. Real-world provenance makes a rule more credible and helps reviewers understand the severity call.

---

## Flutter and React Native support

This is the biggest open area in AppProbe right now. Flutter and React Native projects have their own legacy patterns, deprecated packages, and architectural drift — and AI assistants are just as blind to them as they are to native projects.

### How hybrid platforms fit into AppProbe

Flutter and React Native are detected as platforms alongside iOS and Android. When AppProbe finds a `pubspec.yaml` it knows it's Flutter. When it finds a `package.json` with `react-native` it knows it's React Native. The same 5 skill scanners run — they just need Flutter- and RN-specific rules added alongside the native ones.

Platform detection already supports `'flutter'` and `'react-native'` as values in `packages/core/src/detector.ts` — they need rules written behind them.

### Flutter — highest impact starting points

These are the patterns that AI assistants reproduce most often on legacy Flutter projects:

**Service calling**
- `http` package used directly in a widget without any abstraction layer — no retry, no auth injection, untestable
- `Dio` used without interceptors — missing the standard place to attach auth tokens and handle 401s centrally
- API calls made inside `initState()` or `build()` directly on a widget

**Third-party**
- `firebase_messaging` v9 and below — completely different API from v10+, AI will mix the two
- `shared_preferences` used to store auth tokens — should be `flutter_secure_storage`
- `provider` v4 and below — breaking changes in v5 changed `ChangeNotifierProvider` behavior significantly
- `get` (GetX) — tightly couples navigation, state, and DI in ways that make AI-generated additions very hard to place correctly

**Code practices**
- `setState()` called after an `await` without a `mounted` check — crashes in production when the widget is disposed mid-request
- `BuildContext` used across async gaps — causes "context is no longer valid" in production
- `dynamic` type used in place of proper Dart models
- `print()` in production code — use a logging package
- `const` missing on widgets that never change — forces unnecessary rebuilds

**Architecture**
- Business logic inside `StatefulWidget` — should live in a ViewModel, BLoC, or Provider notifier
- `Navigator.push` called directly from deep in the widget tree — should go through a named route or router
- BLoC partially adopted — some screens use BLoC, others use raw `setState`. AI won't know which to follow

**Security**
- Tokens stored in `shared_preferences` instead of `flutter_secure_storage`
- `http://` endpoints in Dart source
- No certificate pinning via `SecurityContext`
- `debugPrint` with sensitive values

### React Native — highest impact starting points

**Service calling**
- `fetch()` called directly inside a component without any abstraction
- `axios` without interceptors — no central place for auth headers or error normalization
- API calls inside `useEffect` without a cleanup function — causes state updates on unmounted components

**Third-party**
- `react-navigation` v4 and below — completely different API from v5+, AI will write v5 code into a v4 project
- `AsyncStorage` from the deprecated `@react-native-community/async-storage` path
- `redux` without `redux-toolkit` — boilerplate-heavy pattern AI replicates badly
- `react-native-firebase` v5 and below — modular API changed entirely in v6+

**Code practices**
- `AsyncStorage` used to store auth tokens — unencrypted, readable on rooted devices
- `console.log` with token or user data
- Class components in a project that has moved to hooks — AI will add more class components if it sees them
- Missing TypeScript (`any` type spread through the codebase)

**Architecture**
- Business logic in screen components — no separation of concerns
- Mixed Redux and Context API state management — AI won't know which to use for new features
- Navigation logic scattered in components rather than a central navigation service

**Security**
- Tokens in `AsyncStorage` — should use `react-native-keychain` or `expo-secure-store`
- `http://` URLs in JS/TS source
- `__DEV__` checks missing around debug-only network calls

### Adding a Flutter or React Native rule

The process is identical to adding a native rule. Target the right file extensions and add a platform guard:

```typescript
// Flutter rule — .dart files
{
  pattern: /setState\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?await/,
  title: 'setState called across async gap without mounted check',
  detail: 'Calling setState after an await without checking mounted will throw "setState called after dispose" in production. Always check if (mounted) before calling setState after any await.',
  severity: 'critical',
  category: 'async-safety',
  platforms: ['flutter'],
}

// React Native rule — .ts, .tsx, .js, .jsx files
{
  pattern: /AsyncStorage\.(setItem|getItem).*(?:token|password|secret|key)/i,
  title: 'Sensitive data stored in AsyncStorage',
  detail: 'AsyncStorage is unencrypted and readable on rooted devices. Store tokens and sensitive data in react-native-keychain or expo-secure-store instead.',
  severity: 'critical',
  category: 'insecure-storage',
  platforms: ['react-native'],
}
```

### Test fixtures for hybrid projects

```
test-fixtures/
├── flutter-legacy/     ← Dart + provider v4 + shared_preferences tokens + setState async gaps
├── rn-legacy/          ← JS (not TS) + class components + AsyncStorage tokens + react-navigation v4
└── rn-typescript/      ← TS + hooks + mixed Redux/Context + no react-query
```

Add a fixture alongside your rule. Five lines of Dart or JS that reliably trigger the pattern is enough.

---

## Adding a new SDK to the third-party scanner

```typescript
{
  name: 'YourSDK',
  importPattern: /import\s+YourSDK|import\s+com\.yourcompany\.yoursdk|from\s+['"]your-sdk['"]/,
  depPattern: /YourSDK|your-sdk-package/,
  minSafeVersion: '3.0.0',       // optional — versions below this get flagged
  deprecatedIn: '2023-01-15',    // optional — ISO date when deprecated
  replacedBy: 'BetterSDK',       // optional — what to use instead
  notes: 'What an AI assistant needs to know when it encounters this SDK.',
  platform: 'ios' | 'android' | 'flutter' | 'react-native' | 'both',
},
```

Good candidates: any SDK with a breaking version change, a deprecated API, known privacy or security implications, or a modern replacement that AI assistants should suggest instead.

---

## Adding a new skill scanner

AppProbe v2 will have a full plugin API. To add a new built-in skill scanner now:

1. Create `packages/skills/src/<skill-id>/scanner.ts`
2. Export `async function scan<n>(projectPath: string, platform: Platform): Promise<SkillScanResult>`
3. Add `'<skill-id>'` to the `SkillId` union in `packages/core/src/types.ts`
4. Register it in the `scanners` map in `packages/core/src/orchestrator.ts`
5. Add a system prompt in `SKILL_PROMPTS` in `packages/core/src/ai-reasoner.ts`
6. Add a filename in `SKILL_FILENAMES` in the same file

Good candidates:
- **Dependency management** — SPM vs CocoaPods conflicts, Gradle version catalogs, `pubspec.lock` drift, outdated `package-lock.json`
- **Testing** — XCTest vs Quick/Nimble, presence of unit tests around networking, mock patterns in Dart/JS
- **Accessibility** — missing accessibility labels in iOS, content descriptions in Android, semantic labels in Flutter
- **Performance** — main thread violations, synchronous disk reads, unnecessary widget rebuilds in Flutter

---

## Test fixtures

Test fixtures are small code fragments that trigger specific rules. They live in `test-fixtures/` and let contributors verify rules without needing a real project.

```
test-fixtures/
├── ios-legacy/          ← Swift + Alamofire 4 + Fabric + force unwraps
├── android-legacy/      ← Java + AsyncTask + RxJava + hardcoded keys
├── ios-mixed/           ← Swift + Objective-C mixed
├── android-kotlin/      ← Kotlin + deprecated startActivityForResult
├── flutter-legacy/      ← Dart + provider v4 + shared_preferences tokens
└── rn-legacy/           ← JS + class components + react-navigation v4
```

If you're adding a rule with no existing fixture — add the fixture too. Five lines of code that reliably trigger the rule is enough.

---

## Reporting false positives

False positives erode trust faster than missing rules. If AppProbe flags something incorrectly, open an issue with:

- The code snippet that triggered it
- Which rule fired (the title from the output)
- Why this specific case is not actually a problem

We'd rather have a rule that catches 80% of cases accurately than one that catches 100% with noise.

---

## Sharing real legacy project patterns

No time to write code? Open a **Discussion** with:

- A pattern you've seen repeatedly in a legacy mobile project
- Why it causes problems when an AI assistant encounters it
- What the correct version looks like

Even a two-paragraph description can become a detection rule. Someone else will write it.

---

## Code style

```
TypeScript strict mode · no semicolons · single quotes · 2-space indent
Descriptive variable names — this codebase is read by contributors who don't know it yet
```

Run before submitting:
```bash
npm run build    # must pass with zero errors
npm run lint     # must pass
```

---

## Thank you

To everyone who opens a PR, refines a rule, files an issue, or just tries AppProbe on a real project and tells us what they found — you're the reason this gets better.

The goal is simple: no developer should ever lose hours to an AI assistant that didn't know what it was walking into.
