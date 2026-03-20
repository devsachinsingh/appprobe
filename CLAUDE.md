# AppProbe — AI contributor context

This is the AppProbe repository itself. AppProbe is a CLI tool that scans legacy mobile projects and writes skill.md files for AI-native IDEs.

## Project structure

```
appprobe/
├── packages/
│   ├── cli/src/cli.ts          ← npx appprobe entry point (Commander.js)
│   ├── core/src/
│   │   ├── types.ts            ← all shared TypeScript types
│   │   ├── detector.ts         ← iOS/Android platform detection
│   │   ├── orchestrator.ts     ← wires scanners → AI → output
│   │   ├── ai-reasoner.ts      ← Claude API calls (skill.md generation)
│   │   └── output-writer.ts    ← writes files, updates CLAUDE.md
│   └── skills/src/
│       ├── service-calling/scanner.ts
│       ├── third-party/scanner.ts
│       ├── code-practices/scanner.ts
│       ├── architecture/scanner.ts
│       └── security/scanner.ts
└── .claude/commands/appprobe.md  ← /appprobe slash command
```

## How to add a new detection rule

1. Open the relevant scanner in `packages/skills/src/<skill>/scanner.ts`
2. Add an entry to the patterns array:
```typescript
{
  pattern: /your-regex-here/,
  title: 'Short title for the finding',
  detail: 'What it means and how to fix it.',
  severity: 'critical' | 'warning' | 'info',
  category: 'your-category',
}
```
3. Run `npm run build` and test with `npx appprobe scan ./test-fixtures/<platform>`

## How to add a new skill scanner

1. Create `packages/skills/src/<skill-id>/scanner.ts`
2. Export `async function scan<SkillName>(projectPath, platform): Promise<SkillScanResult>`
3. Add the skill ID to `SkillId` type in `packages/core/src/types.ts`
4. Register it in `packages/core/src/orchestrator.ts`
5. Add a prompt in `packages/core/src/ai-reasoner.ts`
6. Add a filename mapping in `SKILL_FILENAMES`

## Key design decisions

- **Static scan first, AI second** — all regex/file analysis runs before any API call. AI only receives a summary of findings, never raw code. This keeps costs low and privacy high.
- **One AI call per skill** — predictable cost (~5-6 calls per full scan) regardless of project size.
- **Findings de-duplicated per file** — the same pattern found in 50 files reports once per file, not 50 times.
- **CLAUDE.md is always updated** — after every scan, the project's CLAUDE.md gets an AppProbe section so the next AI session has context immediately.

## Adding test fixtures

Place sample iOS/Android projects (or fragments) in `test-fixtures/`:
```
test-fixtures/
├── ios-legacy/          ← Swift + Alamofire 4 + Fabric (pre-Firebase)
├── android-legacy/      ← Java + AsyncTask + RxJava 1
└── rn-project/          ← React Native with ios/ and android/ subdirs
```

Run against a fixture: `node packages/cli/dist/cli.js scan ./test-fixtures/ios-legacy --no-ai`
