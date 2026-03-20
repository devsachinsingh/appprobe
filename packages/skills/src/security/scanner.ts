import type { SkillScanResult, RawFinding, Platform } from '../../../core/src/types'
import { walkFiles, readFileSafe } from '../../../core/src/utils/walker'

// ─── Patterns ─────────────────────────────────────────────────────────────────

const SECURITY_PATTERNS: Array<{
  pattern: RegExp
  title: string
  detail: string
  severity: RawFinding['severity']
  category: string
  platforms: Array<'ios' | 'android'>
}> = [
  // Hardcoded secrets
  {
    pattern: /(?:api_key|apikey|api_secret|secret_key|client_secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
    title: 'Hardcoded API key or secret',
    detail: 'A secret key is hardcoded in source code. Move to environment config, iOS Keychain, or Android EncryptedSharedPreferences. Never commit secrets.',
    severity: 'critical',
    category: 'hardcoded-secret',
    platforms: ['ios', 'android'],
  },
  {
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/i,
    title: 'Hardcoded password',
    detail: 'A password string is hardcoded in source. Use secure storage — Keychain on iOS, EncryptedSharedPreferences on Android.',
    severity: 'critical',
    category: 'hardcoded-secret',
    platforms: ['ios', 'android'],
  },
  {
    pattern: /AKIA[0-9A-Z]{16}/,
    title: 'AWS Access Key ID hardcoded',
    detail: 'An AWS Access Key ID was found in source. This exposes cloud infrastructure. Rotate the key immediately and use IAM roles or Secrets Manager.',
    severity: 'critical',
    category: 'hardcoded-secret',
    platforms: ['ios', 'android'],
  },
  // iOS-specific
  {
    pattern: /UserDefaults\.standard\.set.*(?:token|password|secret|key)/i,
    title: 'Sensitive data stored in UserDefaults',
    detail: 'UserDefaults is not encrypted and is readable by backup tools. Store tokens and sensitive data in the iOS Keychain.',
    severity: 'critical',
    category: 'insecure-storage',
    platforms: ['ios'],
  },
  {
    pattern: /NSLog\(.*(?:token|password|secret|key|auth)/i,
    title: 'Sensitive data logged via NSLog',
    detail: 'NSLog output appears in device system logs readable by other apps on non-sandboxed environments. Remove sensitive data from logs.',
    severity: 'warning',
    category: 'data-leakage',
    platforms: ['ios'],
  },
  {
    pattern: /allowsAnyHTTPSCertificate|ServerTrustPolicy\.disableEvaluation|validatesCertificateChain\s*=\s*false/,
    title: 'SSL certificate validation disabled',
    detail: 'Disabling SSL validation makes the app vulnerable to MITM attacks. Only disable in DEBUG builds with a compile-time guard.',
    severity: 'critical',
    category: 'cert-pinning',
    platforms: ['ios'],
  },
  {
    pattern: /kSecAttrAccessibleAlways(?!WhenPasscodeSetThisDeviceOnly)/,
    title: 'Keychain item accessible always',
    detail: 'kSecAttrAccessibleAlways allows keychain access even when device is locked. Use kSecAttrAccessibleWhenUnlockedThisDeviceOnly for sensitive data.',
    severity: 'warning',
    category: 'insecure-storage',
    platforms: ['ios'],
  },
  // Android-specific
  {
    pattern: /getSharedPreferences|SharedPreferences.*(?:token|password|secret|key)/i,
    title: 'Sensitive data in SharedPreferences',
    detail: 'SharedPreferences are stored as plain XML and are readable on rooted devices. Use EncryptedSharedPreferences from Jetpack Security.',
    severity: 'warning',
    category: 'insecure-storage',
    platforms: ['android'],
  },
  {
    pattern: /Log\.[devi]\(.*(?:token|password|secret|key|auth)/i,
    title: 'Sensitive data in Android log',
    detail: 'Android logs are accessible via adb logcat and readable by other apps on older API levels. Strip sensitive data from log calls.',
    severity: 'warning',
    category: 'data-leakage',
    platforms: ['android'],
  },
  {
    pattern: /ALLOW_ALL_HOSTNAME_VERIFIER|hostnameVerifier\s*=\s*\{.*true\}/,
    title: 'Hostname verification disabled',
    detail: 'Disabling hostname verification bypasses certificate validation, enabling MITM attacks. Remove this immediately.',
    severity: 'critical',
    category: 'cert-pinning',
    platforms: ['android'],
  },
  {
    pattern: /MODE_WORLD_READABLE|MODE_WORLD_WRITEABLE/,
    title: 'World-readable/writable file mode',
    detail: 'MODE_WORLD_READABLE and MODE_WORLD_WRITEABLE are deprecated (API 17) and expose files to other apps. Use private mode.',
    severity: 'critical',
    category: 'insecure-storage',
    platforms: ['android'],
  },
  {
    pattern: /android:debuggable\s*=\s*"true"/,
    title: 'debuggable=true in manifest',
    detail: 'android:debuggable="true" must only appear in debug builds. If present in release manifest, attackers can attach a debugger. Use build variants.',
    severity: 'critical',
    category: 'configuration',
    platforms: ['android'],
  },
  {
    pattern: /android:allowBackup\s*=\s*"true"/,
    title: 'allowBackup enabled in manifest',
    detail: 'With allowBackup=true, app data (including SharedPreferences) can be extracted via adb backup on unrooted devices. Set to false or implement BackupAgent.',
    severity: 'warning',
    category: 'configuration',
    platforms: ['android'],
  },
]

// ─── Cert pinning detection ───────────────────────────────────────────────────

function detectCertPinning(projectPath: string, platform: Platform): boolean {
  if (platform === 'ios' || platform === 'both') {
    const swiftFiles = walkFiles(projectPath, ['.swift'], 8)
    for (const f of swiftFiles) {
      const content = readFileSafe(f.absolutePath)
      if (/ServerTrustPolicy|pinnedCertificates|TrustKit|CertificatePinner/.test(content)) return true
    }
  }
  if (platform === 'android' || platform === 'both') {
    const files = walkFiles(projectPath, ['.kt', '.java', '.xml'], 8)
    for (const f of files) {
      const content = readFileSafe(f.absolutePath)
      if (/CertificatePinner|network-security-config|pin-set|OkHttpClient.*CertificatePinner/.test(content)) return true
    }
  }
  return false
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanSecurity(
  projectPath: string,
  platform: Platform
): Promise<SkillScanResult> {
  const findings: RawFinding[] = []
  const metadata: Record<string, unknown> = {}

  const iosFiles = platform !== 'android'
    ? walkFiles(projectPath, ['.swift', '.m', '.h', '.plist', '.entitlements'], 8)
    : []
  const androidFiles = platform !== 'ios'
    ? walkFiles(projectPath, ['.kt', '.java', '.xml', '.gradle'], 8)
    : []

  const allFiles = [
    ...iosFiles.map(f => ({ ...f, plat: 'ios' as const })),
    ...androidFiles.map(f => ({ ...f, plat: 'android' as const })),
  ]

  for (const file of allFiles) {
    const content = readFileSafe(file.absolutePath)
    const lines = content.split('\n')

    for (const rule of SECURITY_PATTERNS) {
      if (!rule.platforms.includes(file.plat) && platform !== 'both') continue

      lines.forEach((line, idx) => {
        if (rule.pattern.test(line)) {
          const isDupe = findings.some(
            f => f.title === rule.title && f.filePath === file.relativePath
          )
          if (!isDupe) {
            findings.push({
              skillId: 'security',
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

  const hasCertPinning = detectCertPinning(projectPath, platform)
  metadata.certPinningDetected = hasCertPinning

  if (!hasCertPinning) {
    findings.push({
      skillId: 'security',
      category: 'cert-pinning',
      severity: 'warning',
      title: 'No certificate pinning detected',
      detail: 'No certificate pinning implementation found. Without pinning, the app is vulnerable to MITM attacks on untrusted networks. Consider TrustKit (iOS) or OkHttp CertificatePinner (Android).',
    })
  }

  metadata.filesScanned = allFiles.length
  metadata.criticalCount = findings.filter(f => f.severity === 'critical').length
  metadata.warningCount = findings.filter(f => f.severity === 'warning').length

  return { skillId: 'security', platform, findings, metadata }
}
