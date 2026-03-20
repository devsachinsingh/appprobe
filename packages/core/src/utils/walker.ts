import fs from 'fs'
import path from 'path'

const ALWAYS_IGNORE = new Set([
  'node_modules', '.git', '.svn', 'build', 'dist',
  'DerivedData', '.build', 'Pods', 'Carthage',
  '.gradle', '.idea', '.DS_Store', '__pycache__',
  'xcuserdata', '.xcodeproj', 'fastlane',
])

export interface WalkedFile {
  absolutePath: string
  relativePath: string
  extension: string
  sizeBytes: number
}

export function walkFiles(
  rootPath: string,
  extensions: string[],
  maxDepth = 8
): WalkedFile[] {
  const extSet = new Set(extensions.map(e => e.toLowerCase()))
  const results: WalkedFile[] = []

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (ALWAYS_IGNORE.has(entry.name)) continue
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(full, depth + 1)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (extSet.has(ext) || extSet.has(entry.name.toLowerCase())) {
          try {
            const stat = fs.statSync(full)
            results.push({
              absolutePath: full,
              relativePath: path.relative(rootPath, full),
              extension: ext,
              sizeBytes: stat.size,
            })
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  walk(rootPath, 0)
  return results
}

export function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

export function findFileByName(rootPath: string, fileName: string): string | null {
  const results = walkFiles(rootPath, [fileName], 6)
  return results[0]?.absolutePath ?? null
}
