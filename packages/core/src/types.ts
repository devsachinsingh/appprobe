// ─────────────────────────────────────────────
//  AppProbe — shared types
// ─────────────────────────────────────────────

export type Platform = 'ios' | 'android' | 'both' | 'unknown'

export type SkillId =
  | 'service-calling'
  | 'third-party'
  | 'code-practices'
  | 'architecture'
  | 'security'

export interface ScanOptions {
  projectPath: string
  platform?: Platform
  skills?: SkillId[]
  liveDocs?: boolean
  apiKey?: string
  outputDir?: string
  verbose?: boolean
}

export interface RawFinding {
  skillId: SkillId
  category: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  filePath?: string
  lineNumber?: number
  evidence?: string     // snippet of code, not more than 3 lines
}

export interface SkillScanResult {
  skillId: SkillId
  platform: Platform
  findings: RawFinding[]
  metadata: Record<string, unknown>  // e.g. detected deps, versions
}

export interface SkillMarkdown {
  skillId: SkillId
  filename: string
  content: string       // full markdown string written to disk
}

export interface HealthScore {
  overall: number       // 0–100
  breakdown: Record<SkillId, number>
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

export interface ScanReport {
  projectPath: string
  platform: Platform
  scannedAt: string
  skills: SkillMarkdown[]
  healthScore: HealthScore
  gapReport: string     // markdown of all critical/warning findings
}

// ─────────────────────────────────────────────
//  Plugin interface — ready for v2
// ─────────────────────────────────────────────

export interface AppProbeSkillPlugin {
  id: SkillId
  name: string
  description: string
  supportedPlatforms: Platform[]
  scan(projectPath: string, platform: Platform): Promise<SkillScanResult>
}
