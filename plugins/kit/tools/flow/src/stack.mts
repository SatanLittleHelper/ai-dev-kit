import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Stack = 'nestjs' | 'angular'

const MARKERS: Record<Stack, string> = { nestjs: '@nestjs/core', angular: '@angular/core' }

interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

// Смотрит только корневой package.json: вложенные пакеты монорепозитория не обходятся.
export function detectStacks(root: string): Stack[] {
  const path = join(root, 'package.json')
  if (!existsSync(path)) return []

  let manifest: Manifest
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return []
  }

  const names = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})])

  return (Object.keys(MARKERS) as Stack[]).filter(stack => names.has(MARKERS[stack]))
}
