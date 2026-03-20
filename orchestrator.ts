import type { ScanOptions, ScanReport, SkillScanResult } from './types'
import { detectPlatform } from './detector'
import { generateSkillMarkdown, generateHealthScore } from './ai-reasoner'
import { writeOutputs } from './output-writer'
import { scanServiceCalling } from '../../../skills/src/service-calling/scanner'
import { scanThirdParty } from '../../../skills/src/third-party/scanner'
import { scanCodePractices } from '../../../skills/src/code-practices/scanner'
import { scanArchitecture } from '../../../skills/src/architecture/scanner'
import { scanSecurity } from '../../../skills/src/security/scanner'

export interface ScanProgress {
  stage: string
  skill?: string
  done: number
  total: number
}

export async function runScan(
  options: ScanOptions,
  onProgress?: (p: ScanProgress) => void
): Promise<ScanReport> {
  const { projectPath, skills, apiKey, outputDir } = options

  // ── Step 1: Detect platform ───────────────────────────────────────────────
  onProgress?.({ stage: 'detecting platform', done: 0, total: 7 })
  const platformInfo = detectPlatform(projectPath)
  const platform = options.platform ?? platformInfo.platform

  if (platform === 'unknown') {
    throw new Error(
      `AppProbe could not detect a mobile project at "${projectPath}".\n` +
      `Expected to find Podfile, Package.swift, build.gradle, or similar.`
    )
  }

  // ── Step 2: Run static scanners ───────────────────────────────────────────
  const skillsToRun = skills ?? ['service-calling', 'third-party', 'code-practices', 'architecture', 'security']
  const rawResults: SkillScanResult[] = []

  const scanners: Record<string, (p: string, pl: typeof platform) => Promise<SkillScanResult>> = {
    'service-calling': scanServiceCalling,
    'third-party': scanThirdParty,
    'code-practices': scanCodePractices,
    'architecture': scanArchitecture,
    'security': scanSecurity,
  }

  for (let i = 0; i < skillsToRun.length; i++) {
    const skillId = skillsToRun[i]
    onProgress?.({ stage: 'scanning', skill: skillId, done: i + 1, total: 7 })
    const scanner = scanners[skillId]
    if (scanner) {
      const result = await scanner(projectPath, platform)
      rawResults.push(result)
    }
  }

  // ── Step 3: AI reasoning — generate skill.md per skill ───────────────────
  onProgress?.({ stage: 'reasoning with AI', done: 6, total: 7 })
  const skillMarkdowns = await Promise.all(
    rawResults.map(result => generateSkillMarkdown(result, platformInfo, apiKey))
  )

  // ── Step 4: Health score ──────────────────────────────────────────────────
  const healthScoreResult = await generateHealthScore(rawResults, apiKey)

  // ── Step 5: Write outputs ─────────────────────────────────────────────────
  onProgress?.({ stage: 'writing outputs', done: 7, total: 7 })
  writeOutputs(projectPath, skillMarkdowns, healthScoreResult, rawResults, outputDir)

  const allFindings = rawResults.flatMap(r => r.findings)
  const criticals = allFindings.filter(f => f.severity === 'critical')
  const warnings = allFindings.filter(f => f.severity === 'warning')

  const gapReport = [
    `# Gap report — ${new Date().toISOString().split('T')[0]}`,
    ``,
    criticals.length > 0 ? `## Critical\n${criticals.map(f => `- **${f.title}**: ${f.detail}`).join('\n')}` : '',
    warnings.length > 0 ? `## Warnings\n${warnings.map(f => `- **${f.title}**: ${f.detail}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  return {
    projectPath,
    platform,
    scannedAt: new Date().toISOString(),
    skills: skillMarkdowns,
    healthScore: healthScoreResult,
    gapReport,
  }
}
