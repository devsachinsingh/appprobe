import Anthropic from '@anthropic-ai/sdk'
import type { SkillScanResult, SkillMarkdown, HealthScore, SkillId } from './types'
import type { PlatformInfo } from './detector'

const SKILL_PROMPTS: Record<SkillId, string> = {
  'service-calling': `You are a senior mobile engineer writing a skill.md file for an AI coding assistant (like Claude Code or Cursor) about this project's networking and API layer. The AI will use this file as context when helping developers add new features or fix bugs.`,
  'third-party': `You are a senior mobile engineer writing a skill.md file for an AI coding assistant about this project's third-party SDK integrations. The AI will use this to avoid introducing deprecated patterns and understand what SDKs are already in use.`,
  'code-practices': `You are a senior mobile engineer writing a skill.md file for an AI coding assistant about this project's code quality and language patterns. The AI will use this to match existing conventions and avoid known antipatterns.`,
  'architecture': `You are a senior mobile engineer writing a skill.md file for an AI coding assistant about this project's architecture. The AI will use this to ensure new modules follow the same architectural pattern and separation of concerns.`,
  'security': `You are a senior mobile engineer writing a skill.md file for an AI coding assistant about this project's security posture. The AI will use this to avoid introducing new security vulnerabilities and to know which patterns are already flagged.`,
}

const SKILL_FILENAMES: Record<SkillId, string> = {
  'service-calling': 'service-calling.skill.md',
  'third-party': 'third-party.skill.md',
  'code-practices': 'code-practices.skill.md',
  'architecture': 'architecture.skill.md',
  'security': 'security.skill.md',
}

function buildUserPrompt(result: SkillScanResult, platformInfo: PlatformInfo): string {
  const criticals = result.findings.filter(f => f.severity === 'critical')
  const warnings = result.findings.filter(f => f.severity === 'warning')
  const infos = result.findings.filter(f => f.severity === 'info')

  const findingsText = [
    ...criticals.map(f => `[CRITICAL] ${f.title}\n  Detail: ${f.detail}\n  ${f.filePath ? `File: ${f.filePath}${f.lineNumber ? `:${f.lineNumber}` : ''}` : ''}\n  ${f.evidence ? `Evidence: ${f.evidence}` : ''}`),
    ...warnings.map(f => `[WARNING] ${f.title}\n  Detail: ${f.detail}\n  ${f.filePath ? `File: ${f.filePath}` : ''}`),
    ...infos.map(f => `[INFO] ${f.title}\n  Detail: ${f.detail}\n  ${f.filePath ? `File: ${f.filePath}` : ''}`),
  ].join('\n\n')

  return `Here are the static scan findings for skill: ${result.skillId}

Platform: ${result.platform}
Language: ${JSON.stringify(platformInfo.language)}
Package manager: ${JSON.stringify(platformInfo.packageManager)}
Metadata: ${JSON.stringify(result.metadata, null, 2)}

Findings (${result.findings.length} total — ${criticals.length} critical, ${warnings.length} warnings, ${infos.length} info):
${findingsText || 'No findings detected.'}

Write a skill.md file with these exact sections:

# [Skill name] — AppProbe Skill

## Overview
Brief paragraph describing what was found in this project's ${result.skillId} layer. Be specific about what libraries/patterns were actually detected, not generic advice.

## What's in use
Bullet list of the actual libraries, patterns, and versions detected.

## Rules for AI assistants
CRITICAL numbered list of things an AI assistant MUST follow when touching this area of the codebase. Be direct and specific. Start each with an action verb. Reference actual file patterns found.

## Known issues
For each critical/warning finding: clear description of the problem, why it matters, and the specific fix. Use sub-headings per issue.

## Patterns to follow
Code examples of the CORRECT way to do things in this specific project. Show the actual pattern being used, not generic textbook examples.

## Patterns to avoid
Code examples of what NOT to do — taken from the actual bad patterns found in this scan.

## Migration notes
If there are deprecated APIs or outdated libraries: specific step-by-step migration path for a developer adding a new module.

Keep the tone direct, technical, and actionable. This file will be read by an AI assistant, not a human, so optimise for machine-readable clarity.`
}

function buildHealthScorePrompt(results: SkillScanResult[]): string {
  const summary = results.map(r => ({
    skill: r.skillId,
    critical: r.findings.filter(f => f.severity === 'critical').length,
    warning: r.findings.filter(f => f.severity === 'warning').length,
    info: r.findings.filter(f => f.severity === 'info').length,
  }))

  return `You are scoring a mobile project's health based on static scan results.

Results per skill:
${JSON.stringify(summary, null, 2)}

Return ONLY valid JSON (no markdown, no explanation) in this exact shape:
{
  "overall": <0-100 integer>,
  "breakdown": {
    "service-calling": <0-100>,
    "third-party": <0-100>,
    "code-practices": <0-100>,
    "architecture": <0-100>,
    "security": <0-100>
  },
  "grade": "<A|B|C|D|F>",
  "summary": "<2 sentence plain-english summary of the project health>"
}

Scoring guide:
- Each critical finding deducts 8-12 points from the skill score
- Each warning deducts 3-5 points
- Security criticals weigh double
- Start from 100 and deduct. Floor is 0.
- Overall is weighted average: security 30%, architecture 25%, service-calling 20%, third-party 15%, code-practices 10%
- Grade: A=90-100, B=75-89, C=60-74, D=45-59, F=0-44`
}

// ─── Main AI reasoning function ───────────────────────────────────────────────

export async function generateSkillMarkdown(
  result: SkillScanResult,
  platformInfo: PlatformInfo,
  apiKey?: string
): Promise<SkillMarkdown> {
  const client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    system: SKILL_PROMPTS[result.skillId],
    messages: [{ role: 'user', content: buildUserPrompt(result, platformInfo) }],
  })

  const content = message.content[0]
  const text = content.type === 'text' ? content.text : ''

  // Append AppProbe metadata footer
  const footer = `\n\n---\n_Generated by [AppProbe](https://github.com/appprobe/appprobe) · ${new Date().toISOString().split('T')[0]} · Skill: ${result.skillId} · Platform: ${result.platform}_\n`

  return {
    skillId: result.skillId,
    filename: SKILL_FILENAMES[result.skillId],
    content: text + footer,
  }
}

export async function generateHealthScore(
  results: SkillScanResult[],
  apiKey?: string
): Promise<HealthScore & { summary: string }> {
  const client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [{ role: 'user', content: buildHealthScorePrompt(results) }],
  })

  const content = message.content[0]
  const text = content.type === 'text' ? content.text.trim() : '{}'

  try {
    return JSON.parse(text)
  } catch {
    // Fallback: compute score locally if AI response fails
    const criticalCount = results.flatMap(r => r.findings).filter(f => f.severity === 'critical').length
    const warningCount = results.flatMap(r => r.findings).filter(f => f.severity === 'warning').length
    const overall = Math.max(0, 100 - criticalCount * 10 - warningCount * 4)
    const grade = overall >= 90 ? 'A' : overall >= 75 ? 'B' : overall >= 60 ? 'C' : overall >= 45 ? 'D' : 'F'
    return {
      overall,
      breakdown: Object.fromEntries(results.map(r => [r.skillId, overall])) as Record<SkillId, number>,
      grade,
      summary: `${criticalCount} critical issues and ${warningCount} warnings detected across ${results.length} skill areas.`,
    }
  }
}
