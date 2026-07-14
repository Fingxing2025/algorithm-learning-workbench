import { extname } from 'node:path'

import { PublicError } from '../errors/public-error'
import { getLanguageForExtension } from '../services/template-scanner'

export function normalizeTemplateRelativePath(input: string): string {
  const normalized = input.trim().replace(/\\/g, '/').normalize('NFC')
  if (!normalized || normalized.length > 4096 || normalized.startsWith('/')) {
    throw new PublicError('INVALID_REQUEST', '模板保存路径必须是工作区内的相对路径。')
  }
  const segments = normalized.split('/')
  if (
    segments.some(
      segment =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\0') ||
        segment.length > 255,
    )
  ) {
    throw new PublicError('PATH_NOT_AUTHORIZED', '模板保存路径包含无效目录。')
  }
  if (!getLanguageForExtension(extname(normalized).toLowerCase())) {
    throw new PublicError('INVALID_REQUEST', '文件扩展名不受支持，请使用常见源码扩展名。')
  }
  return segments.join('/')
}
