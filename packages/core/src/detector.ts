import fs from 'fs'
import path from 'path'
import type { Platform } from './types'

interface PlatformInfo {
  platform: Platform
  language: {
    ios?: 'swift' | 'objc' | 'mixed'
    android?: 'kotlin' | 'java' | 'mixed'
  }
  packageManager: {
    ios?: 'cocoapods' | 'spm' | 'carthage' | 'mixed'
    android?: 'gradle'
  }
  indicators: string[]  // files that confirmed the detection
}

// Files that confirm a platform is present
const IOS_INDICATORS = [
  'Podfile',
  'Podfile.lock',
  'Package.swift',
  'Cartfile',
  '*.xcodeproj',
  '*.xcworkspace',
  '*.xctestplan',
]

const ANDROID_INDICATORS = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradlew',
  'AndroidManifest.xml',
]

function exists(base: string, file: string): boolean {
  // handle glob-like patterns (e.g. *.xcodeproj)
  if (file.startsWith('*')) {
    const ext = file.slice(1) // e.g. '.xcodeproj'
    try {
      return fs.readdirSync(base).some(f => f.endsWith(ext))
    } catch {
      return false
    }
  }
  return fs.existsSync(path.join(base, file))
}

function detectIos(projectPath: string): { detected: boolean; indicators: string[] } {
  const found = IOS_INDICATORS.filter(f => exists(projectPath, f))
  return { detected: found.length > 0, indicators: found }
}

function detectAndroid(projectPath: string): { detected: boolean; indicators: string[] } {
  // Also check one level deep (common: android/ subfolder in RN projects)
  const androidSubdir = path.join(projectPath, 'android')
  const found = ANDROID_INDICATORS.filter(
    f => exists(projectPath, f) || exists(androidSubdir, f)
  )
  return { detected: found.length > 0, indicators: found }
}

function detectIosLanguage(projectPath: string): 'swift' | 'objc' | 'mixed' {
  let hasSwift = false
  let hasObjc = false

  function walk(dir: string, depth = 0) {
    if (depth > 4) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'Pods' || e.name === 'build') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(full, depth + 1)
      } else {
        if (e.name.endsWith('.swift')) hasSwift = true
        if (e.name.endsWith('.m') || e.name.endsWith('.h')) hasObjc = true
      }
    }
  }

  walk(projectPath)
  if (hasSwift && hasObjc) return 'mixed'
  if (hasSwift) return 'swift'
  return 'objc'
}

function detectAndroidLanguage(projectPath: string): 'kotlin' | 'java' | 'mixed' {
  let hasKotlin = false
  let hasJava = false

  function walk(dir: string, depth = 0) {
    if (depth > 6) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'build' || e.name === '.gradle') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(full, depth + 1)
      } else {
        if (e.name.endsWith('.kt') || e.name.endsWith('.kts')) hasKotlin = true
        if (e.name.endsWith('.java')) hasJava = true
      }
    }
  }

  walk(projectPath)
  if (hasKotlin && hasJava) return 'mixed'
  if (hasKotlin) return 'kotlin'
  return 'java'
}

function detectIosPackageManager(projectPath: string): 'cocoapods' | 'spm' | 'carthage' | 'mixed' {
  const hasPod = exists(projectPath, 'Podfile')
  const hasSpm = exists(projectPath, 'Package.swift')
  const hasCarthage = exists(projectPath, 'Cartfile')
  const count = [hasPod, hasSpm, hasCarthage].filter(Boolean).length
  if (count > 1) return 'mixed'
  if (hasPod) return 'cocoapods'
  if (hasSpm) return 'spm'
  if (hasCarthage) return 'carthage'
  return 'spm' // default assumption for modern Swift projects
}

export function detectPlatform(projectPath: string): PlatformInfo {
  const ios = detectIos(projectPath)
  const android = detectAndroid(projectPath)

  let platform: Platform = 'unknown'
  if (ios.detected && android.detected) platform = 'both'
  else if (ios.detected) platform = 'ios'
  else if (android.detected) platform = 'android'

  return {
    platform,
    language: {
      ...(ios.detected ? { ios: detectIosLanguage(projectPath) } : {}),
      ...(android.detected ? { android: detectAndroidLanguage(projectPath) } : {}),
    },
    packageManager: {
      ...(ios.detected ? { ios: detectIosPackageManager(projectPath) } : {}),
      ...(android.detected ? { android: 'gradle' } : {}),
    },
    indicators: [...ios.indicators, ...android.indicators],
  }
}

export type { PlatformInfo }
