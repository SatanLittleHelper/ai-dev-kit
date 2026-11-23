import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

// SHA-256 файла-доказательства; null, если это не существующий файл. Путь считается от корня репозитория.
export function fileHash(root: string, evidence: string): string | null {
  const path = resolve(root, evidence)
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) return null

  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
