import path from 'path'
import type { SkillScanResult, RawFinding, Platform } from '../types'
import { readFileSafe, walkFiles } from '../utils/walker'

// ─── Known SDK registry ───────────────────────────────────────────────────────
// Each entry has: import pattern, known deprecated versions, replacement advice

interface SdkEntry {
  name: string
  importPattern: RegExp         // matches in source files
  depPattern?: RegExp           // matches in Podfile/build.gradle
  minSafeVersion?: string       // versions below this are flagged
  deprecatedIn?: string         // version where deprecated
  replacedBy?: string
  notes: string
  platform: 'ios' | 'android' | 'both'
}

const SDK_REGISTRY: SdkEntry[] = [
  // Firebase
  {
    name: 'Firebase Analytics',
    importPattern: /import\s+FirebaseAnalytics|import\s+com\.google\.firebase\.analytics/,
    depPattern: /FirebaseAnalytics|firebase-analytics/,
    minSafeVersion: '10.0.0',
    notes: 'Firebase Analytics v9+ requires explicit initialization. Ensure FirebaseApp.configure() is called before use.',
    platform: 'both',
  },
  {
    name: 'Firebase Crashlytics',
    importPattern: /import\s+FirebaseCrashlytics|import\s+com\.google\.firebase\.crashlytics/,
    depPattern: /FirebaseCrashlytics|firebase-crashlytics/,
    notes: 'Fabric SDK is fully deprecated — ensure migration to Firebase Crashlytics is complete.',
    platform: 'both',
  },
  {
    name: 'Firebase Realtime Database',
    importPattern: /import\s+FirebaseDatabase|import\s+com\.google\.firebase\.database/,
    depPattern: /FirebaseDatabase|firebase-database/,
    notes: 'Consider migrating to Firestore for new features. Realtime Database is still supported but Firestore has better offline support.',
    platform: 'both',
  },
  // Facebook SDK
  {
    name: 'Facebook SDK',
    importPattern: /import\s+FacebookCore|import\s+FBSDKCoreKit|import\s+com\.facebook\.FacebookSdk/,
    depPattern: /FacebookCore|FBSDKCoreKit|facebook-android-sdk/,
    minSafeVersion: '14.0.0',
    notes: 'Facebook SDK v13 and below have known privacy label issues. v14+ is required for App Store compliance. Ensure IDFA usage is declared.',
    platform: 'both',
  },
  // Crashlytics legacy (Fabric)
  {
    name: 'Fabric / Legacy Crashlytics',
    importPattern: /import\s+Crashlytics|import\s+Fabric|import\s+com\.crashlytics\.android/,
    depPattern: /Crashlytics|Fabric|crashlytics/,
    deprecatedIn: '2020-05-04',
    replacedBy: 'Firebase Crashlytics',
    notes: 'Fabric and legacy Crashlytics were shut down. This code may be dead or broken. Migrate to Firebase Crashlytics immediately.',
    platform: 'both',
  },
  // Mixpanel
  {
    name: 'Mixpanel',
    importPattern: /import\s+Mixpanel|import\s+com\.mixpanel\.android/,
    depPattern: /Mixpanel/,
    notes: 'Ensure Mixpanel SDK is v4.0+. Older versions have known memory leaks and are missing GDPR opt-out APIs.',
    platform: 'both',
  },
  // Lottie
  {
    name: 'Lottie',
    importPattern: /import\s+Lottie|import\s+com\.airbnb\.lottie/,
    depPattern: /lottie/i,
    notes: 'Lottie v4+ (iOS) and v6+ (Android) have breaking API changes. Verify LottieAnimationView and AnimationView usage matches version.',
    platform: 'both',
  },
  // iOS-only
  {
    name: 'SwiftyJSON',
    importPattern: /import\s+SwiftyJSON/,
    depPattern: /SwiftyJSON/,
    replacedBy: 'Codable + JSONDecoder',
    notes: 'SwiftyJSON is largely unnecessary with Codable. It adds a dependency for something Swift handles natively. Consider removing.',
    platform: 'ios',
  },
  {
    name: 'SDWebImage',
    importPattern: /import\s+SDWebImage/,
    depPattern: /SDWebImage/,
    notes: 'SDWebImage is actively maintained. If on v4 or below, migrate to v5+ — the API changed significantly.',
    platform: 'ios',
  },
  {
    name: 'Kingfisher',
    importPattern: /import\s+Kingfisher/,
    depPattern: /Kingfisher/,
    notes: 'Kingfisher is a solid choice for image loading. Ensure v7+ for Swift concurrency support.',
    platform: 'ios',
  },
  // Android-only
  {
    name: 'Glide',
    importPattern: /import\s+com\.bumptech\.glide/,
    depPattern: /glide/i,
    notes: 'Glide v4 is stable. Ensure annotation processor (kapt/ksp) is configured correctly for generated API.',
    platform: 'android',
  },
  {
    name: 'Picasso',
    importPattern: /import\s+com\.squareup\.picasso/,
    depPattern: /picasso/i,
    replacedBy: 'Glide or Coil',
    notes: 'Picasso development has slowed significantly. Coil is the modern Kotlin-first alternative. Consider migrating.',
    platform: 'android',
  },
  {
    name: 'RxJava',
    importPattern: /import\s+io\.reactivex/,
    depPattern: /rxjava|rxandroid/i,
    replacedBy: 'Kotlin Coroutines + Flow',
    notes: 'RxJava is still functional but Kotlin Coroutines + Flow is the idiomatic replacement for new Android code. Plan a migration path.',
    platform: 'android',
  },
]

// ─── Podfile version extraction ───────────────────────────────────────────────

function parsePodfileLock(projectPath: string): Record<string, string> {
  const content = readFileSafe(path.join(projectPath, 'Podfile.lock'))
  const versions: Record<string, string> = {}
  const regex = /^\s{2}([\w\-]+)\s+\(([^)]+)\)/gm
  let m: RegExpExecArray | null
  while ((m = regex.exec(content)) !== null) {
    versions[m[1]] = m[2]
  }
  return versions
}

function parseGradleDeps(projectPath: string): Record<string, string> {
  const versions: Record<string, string> = {}
  const gradleFiles = walkFiles(projectPath, ['.gradle', '.kts'], 4)
  for (const f of gradleFiles) {
    const content = readFileSafe(f.absolutePath)
    // e.g. implementation 'com.google.firebase:firebase-analytics:21.3.0'
    const regex = /['"]([\w.\-]+):([\w.\-]+):([0-9]+\.[0-9]+(?:\.[0-9]+)?)['"]/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(content)) !== null) {
      versions[m[2]] = m[3]
    }
  }
  return versions
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanThirdParty(
  projectPath: string,
  platform: Platform
): Promise<SkillScanResult> {
  const findings: RawFinding[] = []
  const metadata: Record<string, unknown> = {}

  const podVersions = platform !== 'android' ? parsePodfileLock(projectPath) : {}
  const gradleVersions = platform !== 'ios' ? parseGradleDeps(projectPath) : {}
  const detectedSdks: string[] = []

  // Collect all source files once
  const sourceFiles = [
    ...(platform !== 'android' ? walkFiles(projectPath, ['.swift', '.m', '.h'], 8) : []),
    ...(platform !== 'ios' ? walkFiles(projectPath, ['.kt', '.java'], 8) : []),
  ]

  for (const sdk of SDK_REGISTRY) {
    // Skip if platform doesn't match
    if (sdk.platform !== 'both' && sdk.platform !== platform && platform !== 'both') continue

    let found = false
    let foundInFile = ''
    let foundLine = 0

    // Search source files for import pattern
    for (const file of sourceFiles) {
      const content = readFileSafe(file.absolutePath)
      const lines = content.split('\n')
      const idx = lines.findIndex(l => sdk.importPattern.test(l))
      if (idx !== -1) {
        found = true
        foundInFile = file.relativePath
        foundLine = idx + 1
        break
      }
    }

    if (!found) continue

    detectedSdks.push(sdk.name)

    // Info finding: SDK detected
    findings.push({
      skillId: 'third-party',
      category: 'sdk-detected',
      severity: 'info',
      title: `${sdk.name} detected`,
      detail: sdk.notes,
      filePath: foundInFile,
      lineNumber: foundLine,
    })

    // Deprecation finding
    if (sdk.deprecatedIn) {
      findings.push({
        skillId: 'third-party',
        category: 'deprecation',
        severity: 'critical',
        title: `${sdk.name} is deprecated`,
        detail: `Deprecated since ${sdk.deprecatedIn}. ${sdk.replacedBy ? `Replace with: ${sdk.replacedBy}.` : ''} ${sdk.notes}`,
        filePath: foundInFile,
        lineNumber: foundLine,
      })
    }

    // Replacement suggestion
    if (sdk.replacedBy && !sdk.deprecatedIn) {
      findings.push({
        skillId: 'third-party',
        category: 'modernisation',
        severity: 'warning',
        title: `${sdk.name} has a modern replacement`,
        detail: `Consider replacing with ${sdk.replacedBy}. ${sdk.notes}`,
        filePath: foundInFile,
        lineNumber: foundLine,
      })
    }
  }

  metadata.detectedSdks = detectedSdks
  metadata.podVersions = podVersions
  metadata.gradleVersions = gradleVersions

  return { skillId: 'third-party', platform, findings, metadata }
}
