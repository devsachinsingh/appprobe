import type { SkillScanResult, RawFinding, Platform } from '../types'
import { walkFiles, readFileSafe } from '../utils/walker'

// ─── Swift patterns ───────────────────────────────────────────────────────────

const SWIFT_PATTERNS: Array<{
  pattern: RegExp
  title: string
  detail: string
  severity: RawFinding['severity']
  category: string
}> = [
  {
    pattern: /var\s+\w+\s*:\s*\w+\?.*=\s*nil/,
    title: 'Implicitly nil optional var',
    detail: 'Prefer let with a non-optional type or initialize with a real value. Excessive optionals spread nil-checks throughout the codebase.',
    severity: 'info',
    category: 'optionals',
  },
  {
    pattern: /!\./,
    title: 'Force unwrap detected',
    detail: 'Force unwrapping (!) will crash if the value is nil. Use guard let, if let, or the nil-coalescing operator ?? instead.',
    severity: 'warning',
    category: 'optionals',
  },
  {
    pattern: /as!/,
    title: 'Force cast (as!) detected',
    detail: 'Force casting crashes if the type is wrong. Use conditional cast (as?) with proper handling.',
    severity: 'warning',
    category: 'type-safety',
  },
  {
    pattern: /print\(.*(?:token|password|secret|key)/i,
    title: 'Sensitive data in print statement',
    detail: 'Printing sensitive data is a security risk in production. Remove or wrap with #if DEBUG.',
    severity: 'warning',
    category: 'logging',
  },
  {
    pattern: /DispatchQueue\.main\.sync/,
    title: 'DispatchQueue.main.sync usage',
    detail: 'DispatchQueue.main.sync can cause deadlocks if called from the main thread. Use .async instead.',
    severity: 'critical',
    category: 'concurrency',
  },
  {
    pattern: /NotificationCenter\.default\.addObserver[\s\S]{0,300}(?!NotificationCenter\.default\.removeObserver)/,
    title: 'NotificationCenter observer possibly not removed',
    detail: 'Adding observers without removing them causes memory leaks and duplicate calls. Store the token and remove on deinit, or use block-based addObserver that returns a token.',
    severity: 'warning',
    category: 'memory',
  },
  {
    pattern: /class\s+\w+\s*\{[\s\S]{0,1000}var\s+\w+\s*:\s*\w+\s*\n(?!.*weak\s+var)/,
    title: 'Possible strong reference cycle',
    detail: 'Check delegate and closure captures for retain cycles. Use [weak self] in closures and weak var for delegate properties.',
    severity: 'info',
    category: 'memory',
  },
  {
    pattern: /UIApplication\.shared\.openURL/,
    title: 'Deprecated UIApplication.openURL',
    detail: 'openURL(_:) is deprecated since iOS 10. Use open(_:options:completionHandler:) instead.',
    severity: 'warning',
    category: 'deprecated-api',
  },
  {
    pattern: /performSegue|UIStoryboard/,
    title: 'Storyboard / segue usage',
    detail: 'Storyboards are error-prone and merge-conflict heavy in teams. Consider migrating to programmatic UI or SwiftUI for new modules.',
    severity: 'info',
    category: 'ui-approach',
  },
  {
    pattern: /@objc\s+func\s+\w+.*@IBAction|@IBAction.*@objc/,
    title: 'IBAction with @objc',
    detail: '@IBAction is already @objc implicitly. Redundant @objc is clutter but harmless.',
    severity: 'info',
    category: 'code-style',
  },
  {
    pattern: /var\s+\w+\s*=\s*\[\w*\]\(\)/,
    title: 'Mutable empty collection var',
    detail: 'If this collection is only appended to during init, consider making it let or using a lazy property.',
    severity: 'info',
    category: 'value-semantics',
  },
]

// ─── Kotlin patterns ──────────────────────────────────────────────────────────

const KOTLIN_PATTERNS: Array<{
  pattern: RegExp
  title: string
  detail: string
  severity: RawFinding['severity']
  category: string
}> = [
  {
    pattern: /!!/,
    title: 'Non-null assertion (!!) detected',
    detail: 'The !! operator throws NullPointerException if null. Use safe calls (?.), let, or Elvis operator (?:) instead.',
    severity: 'warning',
    category: 'null-safety',
  },
  {
    pattern: /lateinit\s+var/,
    title: 'lateinit var usage',
    detail: 'lateinit var bypasses null safety. Ensure the property is always initialized before use, or prefer nullable with proper handling.',
    severity: 'info',
    category: 'null-safety',
  },
  {
    pattern: /GlobalScope\.(launch|async)/,
    title: 'GlobalScope coroutine usage',
    detail: 'GlobalScope coroutines are not tied to any lifecycle and can leak. Use viewModelScope, lifecycleScope, or a custom CoroutineScope.',
    severity: 'critical',
    category: 'coroutines',
  },
  {
    pattern: /runBlocking\s*\{/,
    title: 'runBlocking on unknown thread',
    detail: 'runBlocking blocks the current thread. If called on the main thread it will freeze the UI. Use suspend functions or launch instead.',
    severity: 'warning',
    category: 'coroutines',
  },
  {
    pattern: /Thread\.sleep/,
    title: 'Thread.sleep usage',
    detail: 'Thread.sleep blocks the thread. In coroutines, use delay() instead. On the main thread this causes ANR.',
    severity: 'critical',
    category: 'threading',
  },
  {
    pattern: /Log\.[dvi]\(/,
    title: 'Debug/verbose log calls',
    detail: 'Verbose log calls should be removed or wrapped in BuildConfig.DEBUG checks before release.',
    severity: 'info',
    category: 'logging',
  },
  {
    pattern: /class\s+\w+\s*:\s*\w+\(\)\s*\{[\s\S]{0,2000}inner\s+class/,
    title: 'Inner class detected',
    detail: 'Non-static inner classes hold a reference to the outer class, causing memory leaks. Use a static nested class or extract to a top-level class.',
    severity: 'warning',
    category: 'memory',
  },
  {
    pattern: /AsyncTask/,
    title: 'Deprecated AsyncTask',
    detail: 'AsyncTask is deprecated since API 30 and will be removed. Replace with coroutines: viewModelScope.launch { withContext(Dispatchers.IO) { ... } }',
    severity: 'critical',
    category: 'deprecated-api',
  },
  {
    pattern: /startActivityForResult/,
    title: 'Deprecated startActivityForResult',
    detail: 'startActivityForResult is deprecated. Use the Activity Result API: registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { }.',
    severity: 'warning',
    category: 'deprecated-api',
  },
  {
    pattern: /onRequestPermissionsResult/,
    title: 'Deprecated onRequestPermissionsResult',
    detail: 'onRequestPermissionsResult is deprecated. Use registerForActivityResult(ActivityResultContracts.RequestPermission()) instead.',
    severity: 'warning',
    category: 'deprecated-api',
  },
]

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanCodePractices(
  projectPath: string,
  platform: Platform
): Promise<SkillScanResult> {
  const findings: RawFinding[] = []
  const metadata: Record<string, unknown> = {}

  // ── iOS ───────────────────────────────────────────────────────────────────
  if (platform === 'ios' || platform === 'both') {
    const swiftFiles = walkFiles(projectPath, ['.swift'], 8)
    metadata.swiftFiles = swiftFiles.length

    for (const file of swiftFiles) {
      const content = readFileSafe(file.absolutePath)
      const lines = content.split('\n')

      for (const rule of SWIFT_PATTERNS) {
        lines.forEach((line, idx) => {
          if (rule.pattern.test(line)) {
            const isDupe = findings.some(
              f => f.title === rule.title && f.filePath === file.relativePath
            )
            if (!isDupe) {
              findings.push({
                skillId: 'code-practices',
                category: rule.category,
                severity: rule.severity,
                title: rule.title,
                detail: rule.detail,
                filePath: file.relativePath,
                lineNumber: idx + 1,
                evidence: line.trim().slice(0, 120),
              })
            }
          }
        })
      }
    }
  }

  // ── Android ───────────────────────────────────────────────────────────────
  if (platform === 'android' || platform === 'both') {
    const kotlinFiles = walkFiles(projectPath, ['.kt'], 8)
    const javaFiles = walkFiles(projectPath, ['.java'], 8)
    metadata.kotlinFiles = kotlinFiles.length
    metadata.javaFiles = javaFiles.length

    for (const file of kotlinFiles) {
      const content = readFileSafe(file.absolutePath)
      const lines = content.split('\n')

      for (const rule of KOTLIN_PATTERNS) {
        lines.forEach((line, idx) => {
          if (rule.pattern.test(line)) {
            const isDupe = findings.some(
              f => f.title === rule.title && f.filePath === file.relativePath
            )
            if (!isDupe) {
              findings.push({
                skillId: 'code-practices',
                category: rule.category,
                severity: rule.severity,
                title: rule.title,
                detail: rule.detail,
                filePath: file.relativePath,
                lineNumber: idx + 1,
                evidence: line.trim().slice(0, 120),
              })
            }
          }
        })
      }
    }

    // Java-specific: flag all Java files as migration candidates
    if (javaFiles.length > 0) {
      findings.push({
        skillId: 'code-practices',
        category: 'modernisation',
        severity: 'info',
        title: `${javaFiles.length} Java file(s) detected in Android project`,
        detail: 'Java files in an Android project should be migrated to Kotlin. Kotlin is the official language for Android and provides null safety, coroutines, and better interoperability.',
      })
    }
  }

  return { skillId: 'code-practices', platform, findings, metadata }
}
