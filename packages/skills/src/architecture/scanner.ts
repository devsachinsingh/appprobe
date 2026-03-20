import type { SkillScanResult, RawFinding, Platform } from '../../../core/src/types'
import { walkFiles, readFileSafe } from '../../../core/src/utils/walker'

type ArchPattern = 'mvc' | 'mvvm' | 'viper' | 'clean' | 'mvi' | 'unknown'

// ─── Architecture detection signals ───────────────────────────────────────────

const ARCH_SIGNALS: Record<ArchPattern, RegExp[]> = {
  viper: [
    /protocol\s+\w+Interactor/,
    /protocol\s+\w+Presenter/,
    /protocol\s+\w+Router/,
    /protocol\s+\w+Wireframe/,
    /class\s+\w+Interactor/,
  ],
  mvvm: [
    /class\s+\w+ViewModel/,
    /struct\s+\w+ViewModel/,
    /ObservableObject|@Published|LiveData|StateFlow|MutableStateFlow/,
    /viewModel\.\w+\.observe|collectAsState|\.bind\(to:/,
  ],
  clean: [
    /class\s+\w+UseCase|protocol\s+\w+UseCase/,
    /class\s+\w+Repository|protocol\s+\w+Repository/,
    /class\s+\w+Interactor|protocol\s+\w+Interactor/,
    /Domain|UseCases|Entities/,
  ],
  mvi: [
    /sealed\s+class\s+\w+Intent|sealed\s+interface\s+\w+Intent/,
    /sealed\s+class\s+\w+State/,
    /class\s+\w+Store/,
  ],
  mvc: [
    /UIViewController|class\s+\w+ViewController/,
    /class\s+\w+Controller.*UIViewController/,
    /Activity|Fragment/,
  ],
  unknown: [],
}

// ─── Anti-pattern rules ───────────────────────────────────────────────────────

const ANTIPATTERNS: Array<{
  pattern: RegExp
  title: string
  detail: string
  severity: RawFinding['severity']
  category: string
  platforms: Array<'ios' | 'android' | 'both'>
}> = [
  // Massive ViewController / Activity
  {
    pattern: /class\s+\w+ViewController/,
    title: 'Potential massive view controller',
    detail: 'Check if this ViewController exceeds 300 lines. Massive ViewControllers are a sign of missing abstraction layers. Extract business logic to ViewModels or Interactors.',
    severity: 'info',
    category: 'massive-component',
    platforms: ['ios'],
  },
  {
    pattern: /class\s+\w+Activity|class\s+\w+Fragment/,
    title: 'Potential massive Activity/Fragment',
    detail: 'Check if this Activity/Fragment exceeds 300 lines. Business logic should live in ViewModel or UseCase classes, not in the UI layer.',
    severity: 'info',
    category: 'massive-component',
    platforms: ['android'],
  },
  // Singletons
  {
    pattern: /static\s+(?:let|var)\s+shared\s*=|static\s+(?:let|var)\s+instance\s*=/,
    title: 'Singleton pattern detected',
    detail: 'Singletons create hidden dependencies and make unit testing difficult. Consider dependency injection instead.',
    severity: 'warning',
    category: 'singleton',
    platforms: ['ios'],
  },
  {
    pattern: /companion\s+object\s*\{[^}]*INSTANCE|object\s+\w+\s*\{/,
    title: 'Kotlin singleton/object detected',
    detail: 'Kotlin objects are singletons. In production code, consider using dependency injection (Hilt/Koin) for better testability.',
    severity: 'info',
    category: 'singleton',
    platforms: ['android'],
  },
  // Business logic in UI layer
  {
    pattern: /class\s+\w+ViewController[\s\S]{0,2000}(?:URLSession|Alamofire|AF\.request)/,
    title: 'Network call in ViewController',
    detail: 'Making network calls directly in a ViewController violates separation of concerns. Move to a ViewModel, Service, or Repository.',
    severity: 'critical',
    category: 'separation-of-concerns',
    platforms: ['ios'],
  },
  {
    pattern: /class\s+\w+Activity[\s\S]{0,2000}(?:Retrofit|OkHttp|HttpURLConnection)/,
    title: 'Network call in Activity',
    detail: 'Making network calls in an Activity violates separation of concerns and leaks on rotation. Move to ViewModel + Repository.',
    severity: 'critical',
    category: 'separation-of-concerns',
    platforms: ['android'],
  },
  // Hardcoded strings / magic numbers in architecture
  {
    pattern: /if\s+\w+\s*==\s*["']\w{3,}["']\s*\{/,
    title: 'Magic string comparison in logic',
    detail: 'Magic string comparisons make code fragile and hard to refactor. Use enums, constants, or sealed classes.',
    severity: 'warning',
    category: 'code-smell',
    platforms: ['ios', 'android'],
  },
  // No dependency injection
  {
    pattern: /init\(\)\s*\{[\s\S]{0,500}let\s+\w+\s*=\s*\w+Service\(\)|let\s+\w+\s*=\s*\w+Repository\(\)/,
    title: 'Dependencies instantiated inside init',
    detail: 'Concrete dependencies created inside init make classes untestable. Use constructor injection or a DI framework.',
    severity: 'warning',
    category: 'dependency-injection',
    platforms: ['ios'],
  },
  {
    pattern: /fun\s+\w+\(\)\s*\{[\s\S]{0,300}(?:Repository|Service|Manager)\(\)/,
    title: 'Dependencies instantiated in functions',
    detail: 'Instantiating dependencies directly in functions bypasses DI. Use Hilt, Koin, or constructor injection.',
    severity: 'warning',
    category: 'dependency-injection',
    platforms: ['android'],
  },
]

// ─── File size check (massive component detector) ─────────────────────────────

function checkFileSizes(
  projectPath: string,
  platform: Platform
): RawFinding[] {
  const findings: RawFinding[] = []
  const exts = platform === 'ios' ? ['.swift'] : platform === 'android' ? ['.kt', '.java'] : ['.swift', '.kt', '.java']
  const files = walkFiles(projectPath, exts, 8)

  for (const file of files) {
    const content = readFileSafe(file.absolutePath)
    const lineCount = content.split('\n').length

    if (lineCount > 500) {
      findings.push({
        skillId: 'architecture',
        category: 'massive-component',
        severity: 'critical',
        title: `Very large file: ${file.relativePath.split('/').pop()} (${lineCount} lines)`,
        detail: `This file has ${lineCount} lines, which strongly suggests it is doing too much. Break it down into smaller, focused types. Target: under 200 lines per file.`,
        filePath: file.relativePath,
      })
    } else if (lineCount > 300) {
      findings.push({
        skillId: 'architecture',
        category: 'massive-component',
        severity: 'warning',
        title: `Large file: ${file.relativePath.split('/').pop()} (${lineCount} lines)`,
        detail: `${lineCount} lines is approaching "massive" territory. Consider splitting into smaller focused types before it becomes harder to maintain.`,
        filePath: file.relativePath,
      })
    }
  }

  return findings
}

// ─── Detect dominant architecture pattern ─────────────────────────────────────

function detectArchitecture(projectPath: string, platform: Platform): ArchPattern {
  const exts = platform === 'android' ? ['.kt', '.java'] : ['.swift']
  const files = walkFiles(projectPath, exts, 8)
  const scores: Record<ArchPattern, number> = {
    viper: 0, mvvm: 0, clean: 0, mvi: 0, mvc: 0, unknown: 0,
  }

  for (const file of files.slice(0, 200)) { // cap at 200 files for perf
    const content = readFileSafe(file.absolutePath)
    for (const [arch, patterns] of Object.entries(ARCH_SIGNALS) as [ArchPattern, RegExp[]][]) {
      for (const p of patterns) {
        if (p.test(content)) scores[arch]++
      }
    }
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a)
  const top = sorted[0]
  if (top[1] === 0) return 'unknown'
  // mvc is present in almost every iOS project — only call it MVC if nothing else scored
  if (top[0] === 'mvc' && sorted[1][1] > 0) return sorted[1][0] as ArchPattern
  return top[0] as ArchPattern
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanArchitecture(
  projectPath: string,
  platform: Platform
): Promise<SkillScanResult> {
  const findings: RawFinding[] = []
  const metadata: Record<string, unknown> = {}

  const detectedArch = detectArchitecture(projectPath, platform)
  metadata.detectedPattern = detectedArch

  const exts = platform === 'ios' ? ['.swift', '.m'] : platform === 'android' ? ['.kt', '.java'] : ['.swift', '.m', '.kt', '.java']
  const sourceFiles = walkFiles(projectPath, exts, 8)

  // Run anti-pattern checks
  for (const file of sourceFiles) {
    const content = readFileSafe(file.absolutePath)

    for (const rule of ANTIPATTERNS) {
      if (!rule.platforms.includes('both') && !rule.platforms.includes(
        file.extension === '.swift' || file.extension === '.m' ? 'ios' : 'android'
      )) continue

      if (rule.pattern.test(content)) {
        const isDupe = findings.some(
          f => f.title === rule.title && f.filePath === file.relativePath
        )
        if (!isDupe) {
          findings.push({
            skillId: 'architecture',
            category: rule.category,
            severity: rule.severity,
            title: rule.title,
            detail: rule.detail,
            filePath: file.relativePath,
          })
        }
      }
    }
  }

  // Add size-based findings
  findings.push(...checkFileSizes(projectPath, platform))

  metadata.totalSourceFiles = sourceFiles.length

  return { skillId: 'architecture', platform, findings, metadata }
}
