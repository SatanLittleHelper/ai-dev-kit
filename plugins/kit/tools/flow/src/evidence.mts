import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

// SHA-256 файла-доказательства; null, если это не существующий файл. Путь считается от корня репозитория.
export function fileHash(root: string, evidence: string): string | null {
  const path = resolve(root, evidence)
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) return null

  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

// Путь от текущей папки → путь относительно корня репозитория; null для пути вне репозитория.
export function repoRelative(root: string, cwd: string, path: string): string | null {
  const outside = (rel: string): boolean => rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
  root = resolve(root)
  const absolute = resolve(cwd, path)
  const rel = relative(root, absolute)
  if (outside(rel)) return null

  // Существующий путь проверяется по фактическому расположению: символьная ссылка не должна вести за пределы репозитория.
  const realRoot = realpathSync(root)
  let parent = absolute
  while (parent !== root) {
    try {
      const resolved = realpathSync(parent)
      if (outside(relative(realRoot, resolve(resolved, relative(parent, absolute))))) return null
      break
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException
      if (code === 'ENOTDIR' || code === 'ELOOP') return null
      if (code !== 'ENOENT') throw error
      parent = dirname(parent)
    }
  }

  return rel.split(sep).join('/')
}

export function pathsAlias(first: string, second: string): boolean {
  return first === second || (existsSync(first) && existsSync(second) && realpathSync(first) === realpathSync(second))
}
