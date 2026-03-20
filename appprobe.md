# AppProbe — scan this project

Scan this mobile project with AppProbe and generate AI-ready skill.md context files.

## What this does

AppProbe performs a 5-skill static + AI analysis of this codebase:

1. **Service calling** — detects Alamofire, URLSession, OkHttp, Retrofit patterns and anti-patterns
2. **Third-party integrations** — inventories all SDKs, checks for deprecated versions and missing migrations
3. **Code practices** — flags Swift/Kotlin anti-patterns, deprecated APIs, and style violations
4. **Architecture** — detects the project's pattern (MVC/MVVM/VIPER/Clean) and finds violations
5. **Security** — finds hardcoded secrets, insecure storage, missing cert pinning

## Run it

```bash
npx appprobe scan .
```

Or for a specific platform:
```bash
npx appprobe scan . --platform ios
npx appprobe scan . --platform android
```

Or specific skills only:
```bash
npx appprobe scan . --skills security,third-party
```

## Output

Files written to `ai-context/skills/`:
- `service-calling.skill.md`
- `third-party.skill.md`
- `code-practices.skill.md`
- `architecture.skill.md`
- `security.skill.md`
- `project-health-report.md`

`CLAUDE.md` is automatically updated to reference the skill files.

## After scanning

Always read the relevant skill file before modifying code in that area.
