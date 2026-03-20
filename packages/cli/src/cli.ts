#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import path from 'path'
import { runScan } from '@appprobe/core/orchestrator'
import type { ScanProgress } from '@appprobe/core/orchestrator'
import type { SkillId, Platform } from '@appprobe/core/types'

const pkg = require('../../../package.json')

// ─── ASCII banner ─────────────────────────────────────────────────────────────

function printBanner() {
  console.log(chalk.cyan(`
  ╔═══════════════════════════════════════╗
  ║   AppProbe v${pkg.version.padEnd(26)}║
  ║   Mobile project scanner for AI IDEs  ║
  ╚═══════════════════════════════════════╝
`))
}

// ─── Progress spinner ─────────────────────────────────────────────────────────

function makeProgressHandler(spinner: ReturnType<typeof ora>) {
  return (p: ScanProgress) => {
    const pct = Math.round((p.done / p.total) * 100)
    if (p.skill) {
      spinner.text = `[${pct}%] Scanning: ${chalk.cyan(p.skill)}...`
    } else {
      spinner.text = `[${pct}%] ${p.stage}...`
    }
  }
}

// ─── Scan command ─────────────────────────────────────────────────────────────

const program = new Command()

program
  .name('appprobe')
  .description('AI-powered mobile project scanner. Generates skill.md context files for legacy iOS & Android projects.')
  .version(pkg.version)

program
  .command('scan [projectPath]')
  .description('Scan a mobile project and generate skill.md files')
  .option('-p, --platform <platform>', 'Force platform: ios | android | both', undefined)
  .option('-s, --skills <skills>', 'Comma-separated skill IDs to run (default: all)', undefined)
  .option('-o, --output <dir>', 'Output directory for skill files (default: <project>/ai-context/skills)', undefined)
  .option('-k, --api-key <key>', 'Anthropic API key (default: $ANTHROPIC_API_KEY)', undefined)
  .option('--no-ai', 'Run static scan only, skip AI reasoning (no skill.md written)', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (projectPath: string | undefined, options) => {
    printBanner()

    const resolvedPath = path.resolve(projectPath ?? '.')

    // Validate API key
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!options.noAi && !apiKey) {
      console.error(chalk.red(`
  ✖ No Anthropic API key found.

  Set it in your environment:
    ${chalk.cyan('export ANTHROPIC_API_KEY=sk-ant-...')}

  Or pass it directly:
    ${chalk.cyan('npx appprobe scan --api-key sk-ant-...')}

  If you're inside Claude Code or Cursor, the key is inherited automatically.
  For static-only scan (no AI), use: ${chalk.cyan('--no-ai')}
`))
      process.exit(1)
    }

    const skills = options.skills
      ? (options.skills.split(',').map((s: string) => s.trim()) as SkillId[])
      : undefined

    const spinner = ora({ text: 'Starting scan...', color: 'cyan' }).start()

    try {
      const report = await runScan(
        {
          projectPath: resolvedPath,
          platform: options.platform as Platform | undefined,
          skills,
          apiKey,
          outputDir: options.output,
          verbose: options.verbose,
        },
        makeProgressHandler(spinner)
      )

      spinner.succeed(chalk.green('Scan complete!'))
      console.log()

      // ── Summary ─────────────────────────────────────────────────────────
      const gradeColor =
        report.healthScore.grade === 'A' ? chalk.green
          : report.healthScore.grade === 'B' ? chalk.yellow
            : report.healthScore.grade === 'C' ? chalk.yellow
              : chalk.red

      console.log(chalk.bold('  Project health'))
      console.log(`  Score : ${gradeColor(`${report.healthScore.overall}/100`)}`)
      console.log(`  Grade : ${gradeColor(report.healthScore.grade)}`)
      console.log(`  Platform detected: ${chalk.cyan(report.platform)}`)
      console.log()

      console.log(chalk.bold('  Skill scores'))
      for (const [skill, scoreValue] of Object.entries(report.healthScore.breakdown)) {
        const score = scoreValue as number
        const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10))
        const color = score >= 75 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red
        console.log(`  ${skill.padEnd(20)} ${color(bar)} ${score}/100`)
      }
      console.log()

      const allFindings = report.skills.length
      const outputDir = options.output ?? path.join(resolvedPath, 'ai-context', 'skills')
      console.log(chalk.bold('  Output'))
      console.log(`  ${chalk.cyan(outputDir)}`)
      console.log(`  ${allFindings} skill files + 1 health report + CLAUDE.md updated`)
      console.log()

      console.log(chalk.dim('  Tip: Open this project in Claude Code or Cursor.'))
      console.log(chalk.dim('  AI assistants will automatically pick up the generated skill files.'))
      console.log()

    } catch (err: unknown) {
      spinner.fail(chalk.red('Scan failed'))
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`\n  ${message}\n`))
      if (options.verbose && err instanceof Error) {
        console.error(err.stack)
      }
      process.exit(1)
    }
  })

// ─── Init command — adds .claude/commands/appprobe.md ─────────────────────────

program
  .command('init [projectPath]')
  .description('Add AppProbe slash command to Claude Code (.claude/commands/appprobe.md)')
  .action(async (projectPath: string | undefined) => {
    const fs = await import('fs')
    const resolvedPath = path.resolve(projectPath ?? '.')
    const commandsDir = path.join(resolvedPath, '.claude', 'commands')
    const commandFile = path.join(commandsDir, 'appprobe.md')

    fs.mkdirSync(commandsDir, { recursive: true })
    fs.writeFileSync(commandFile, CLAUDE_COMMAND_CONTENT, 'utf-8')

    console.log(chalk.green(`\n  ✔ AppProbe slash command added:`))
    console.log(chalk.cyan(`    ${commandFile}`))
    console.log()
    console.log(`  Inside Claude Code, run: ${chalk.cyan('/appprobe')}`)
    console.log()
  })

// ─── Claude Code slash command content ───────────────────────────────────────

const CLAUDE_COMMAND_CONTENT = `# AppProbe — scan this project

Run AppProbe to scan this mobile project and generate AI-ready skill.md files.

## Usage

Run the following in the terminal:

\`\`\`bash
npx appprobe scan .
\`\`\`

This will:
1. Detect the platform (iOS / Android / both)
2. Run 5 static skill scanners across the entire codebase
3. Use Claude AI to reason about findings and write skill.md files
4. Output to \`ai-context/skills/\` at the project root
5. Update \`CLAUDE.md\` so future AI sessions have full context

## After scanning

Read the generated skill files before modifying any code in this project:
- \`ai-context/skills/service-calling.skill.md\`
- \`ai-context/skills/third-party.skill.md\`
- \`ai-context/skills/code-practices.skill.md\`
- \`ai-context/skills/architecture.skill.md\`
- \`ai-context/skills/security.skill.md\`
- \`ai-context/skills/project-health-report.md\`
`

// ─── Run ──────────────────────────────────────────────────────────────────────

program.parse(process.argv)

if (!process.argv.slice(2).length) {
  program.outputHelp()
}
