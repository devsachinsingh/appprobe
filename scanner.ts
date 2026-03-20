import path from 'path'
import type { SkillScanResult, RawFinding, Platform } from '../types'
import { walkFiles, readFileSafe } from '../utils/walker'

// ─── iOS patterns ────────────────────────────────────────────────────────────

const IOS_SERVICE_PATTERNS: Array<{
  pattern: RegExp
  title: string
  detail: string
  severity: RawFinding['severity']
  category: string
}> = [
  {
    pattern: /import\s+Alamofire/,
    title: 'Alamofire detected',
    detail: 'Project uses Alamofire for networking. Check version and usage patterns.',
    severity: 'info',
    category: 'dependency',
  },
  {
    pattern: /AF\.request|Alamofire\.request/,
    title: 'Direct Alamofire AF.request usage',
    detail: 'Using AF.request directly without a network layer abstraction. Consider wrapping in a service/repository layer.',
    severity: 'warning',
    category: 'abstraction',
  },
  {
    pattern: /URLSession\.shared/,
    title: 'URLSession.shared singleton',
    detail: 'Using URLSession.shared directly. This is hard to mock in tests. Inject URLSession as a dependency instead.',
    severity: 'warning',
    category: 'testability',
  },
  {
    pattern: /try!\s+JSONDecoder|try!\s+JSONEncoder/,
    title: 'Force-try on JSON decode/encode',
    detail: 'Force-try on JSON operations will crash on unexpected server responses. Use try-catch or optional try.',
    severity: 'critical',
    category: 'error-handling',
  },
  {
    pattern: /\.responseJSON\s*\{/,
    title: 'Deprecated .responseJSON usage',
    detail: '.responseJSON is deprecated in Alamofire 5+. Use .responseDecodable<T> with Codable models instead.',
    severity: 'warning',
    category: 'deprecation',
  },
  {
    pattern: /http:\/\//i,
    title: 'Plain HTTP endpoint found',
    detail: 'Hardcoded HTTP (non-HTTPS) URL detected. All traffic should use HTTPS. Check ATS settings.',
    severity: 'critical',
    category: 'security',
  },
  {
    pattern: /completionHandler.*@escaping.*\(.*Error.*\)/,
    title: 'Callback-based networking',
    detail: 'Using closure/callback-based async networking. Consider migrating to async/await (Swift 5.5+) for clarity.',
    severity: 'info',
    category: 'modernisation',
  },
  {
    pattern: /DispatchQueue\.main\.async.*response|\.responseDecodable.*DispatchQueue\.main/,
    title: 'Manual main-thread dispatch in response handler',
    detail: 'Manually dispatching to main queue inside response handlers. Alamofire 5+ handles this with responseQueue parameter.',
    severity: 'info',
    category: 'best-practice',
  },
]

// ─── Android patterns ─────────────────────────────────────────────────────────

const ANDROID_SERVICE_PATTERNS: Array<{
  pattern: RegExp
  title: string
  detail: string
  severity: RawFinding['severity']
  category: string
}> = [
  {
    pattern: /import\s+retrofit2\./,
    title: 'Retrofit detected',
    detail: 'Project uses Retrofit for networking. Check version and interface definitions.',
    severity: 'info',
    category: 'dependency',
  },
  {
    pattern: /import\s+okhttp3\./,
    title: 'OkHttp detected',
    detail: 'Project uses OkHttp directly. Ensure it is used through a repository abstraction.',
    severity: 'info',
    category: 'dependency',
  },
  {
    pattern: /new\s+OkHttpClient\(\)/,
    title: 'OkHttpClient created without builder',
    detail: 'Creating OkHttpClient without a builder means no timeout, interceptor, or SSL config. Use OkHttpClient.Builder().',
    severity: 'warning',
    category: 'configuration',
  },
  {
    pattern: /\.execute\(\)|\.enqueue\(null\)/,
    title: 'Synchronous Retrofit call on unknown thread',
    detail: '.execute() is synchronous and will crash if called on the main thread. Always use .enqueue() or coroutines.',
    severity: 'critical',
    category: 'threading',
  },
  {
    pattern: /AsyncTask.*doInBackground.*HttpURLConnection|HttpURLConnection.*AsyncTask/s,
    title: 'AsyncTask + HttpURLConnection detected',
    detail: 'AsyncTask is deprecated (API 30). Replace with coroutines + Retrofit or Ktor.',
    severity: 'critical',
    category: 'deprecation',
  },
  {
    pattern: /http:\/\//i,
    title: 'Plain HTTP endpoint found',
    detail: 'Hardcoded HTTP (non-HTTPS) URL detected. Add network_security_config.xml or migrate to HTTPS.',
    severity: 'critical',
    category: 'security',
  },
  {
    pattern: /GsonConverterFactory\.create\(\)/,
    title: 'Gson converter in use',
    detail: 'Gson is functional but Moshi or kotlinx.serialization is faster and Kotlin-idiomatic. Consider migrating.',
    severity: 'info',
    category: 'modernisation',
  },
  {
    pattern: /\.subscribeOn\(Schedulers\.io\(\)\).*\.observeOn\(AndroidSchedulers\.mainThread/s,
    title: 'RxJava network calls detected',
    detail: 'Using RxJava for network scheduling. Kotlin coroutines + Flow is the modern replacement for new code.',
    severity: 'info',
    category: 'modernisation',
  },
]

// ─── Dependency version extraction ───────────────────────────────────────────

function extractAlamofireVersion(projectPath: string): string | null {
  const podfileLock = path.join(projectPath, 'Podfile.lock')
  const content = readFileSafe(podfileLock)
  const match = content.match(/Alamofire\s*\(([^)]+)\)/)
  return match?.[1] ?? null
}

function extractRetrofitVersion(projectPath: string): string | null {
  const gradleFiles = walkFiles(projectPath, ['.gradle', '.kts'], 3)
  for (const f of gradleFiles) {
    const content = readFileSafe(f.absolutePath)
    const match = content.match(/retrofit[:\s'"]+([0-9]+\.[0-9]+\.[0-9]+)/i)
    if (match) return match[1]
  }
  return null
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanServiceCalling(
  projectPath: string,
  platform: Platform
): Promise<SkillScanResult> {
  const findings: RawFinding[] = []
  const metadata: Record<string, unknown> = {}

  // ── iOS scan ──────────────────────────────────────────────────────────────
  if (platform === 'ios' || platform === 'both') {
    const swiftFiles = walkFiles(projectPath, ['.swift'], 8)
    const alamofireVersion = extractAlamofireVersion(projectPath)
    if (alamofireVersion) metadata.alamofireVersion = alamofireVersion

    for (const file of swiftFiles) {
      const content = readFileSafe(file.absolutePath)
      const lines = content.split('\n')

      for (const rule of IOS_SERVICE_PATTERNS) {
        // Check line by line for precise line numbers
        lines.forEach((line, idx) => {
          if (rule.pattern.test(line)) {
            // De-duplicate: skip if same title+file already recorded
            const isDupe = findings.some(
              f => f.title === rule.title && f.filePath === file.relativePath
            )
            if (!isDupe) {
              findings.push({
                skillId: 'service-calling',
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

    metadata.ios = {
      swiftFilesScanned: swiftFiles.length,
      alamofireVersion: alamofireVersion ?? 'not detected',
    }
  }

  // ── Android scan ──────────────────────────────────────────────────────────
  if (platform === 'android' || platform === 'both') {
    const kotlinFiles = walkFiles(projectPath, ['.kt', '.kts'], 8)
    const javaFiles = walkFiles(projectPath, ['.java'], 8)
    const allAndroidFiles = [...kotlinFiles, ...javaFiles]
    const retrofitVersion = extractRetrofitVersion(projectPath)
    if (retrofitVersion) metadata.retrofitVersion = retrofitVersion

    for (const file of allAndroidFiles) {
      const content = readFileSafe(file.absolutePath)
      const lines = content.split('\n')

      for (const rule of ANDROID_SERVICE_PATTERNS) {
        lines.forEach((line, idx) => {
          if (rule.pattern.test(line)) {
            const isDupe = findings.some(
              f => f.title === rule.title && f.filePath === file.relativePath
            )
            if (!isDupe) {
              findings.push({
                skillId: 'service-calling',
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

    metadata.android = {
      kotlinFilesScanned: kotlinFiles.length,
      javaFilesScanned: javaFiles.length,
      retrofitVersion: retrofitVersion ?? 'not detected',
    }
  }

  return { skillId: 'service-calling', platform, findings, metadata }
}
