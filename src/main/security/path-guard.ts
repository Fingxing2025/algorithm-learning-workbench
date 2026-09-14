import { lstat, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { PublicError } from '../errors/public-error'

export function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export async function resolveAuthorizedRoot(rootPath: string): Promise<string> {
  try {
    // Do not silently widen the authorization boundary when the root itself is
    // replaced with a symlink.  `realpath(rootPath)` alone would follow that
    // link and make an otherwise unrelated directory look like the user's
    // selected workspace.  Descendant links are checked separately by
    // resolveAuthorizedFile and the callers that mutate directory trees.
    const requestedRoot = resolve(rootPath)
    const requestedStats = await lstat(requestedRoot)
    if (requestedStats.isSymbolicLink()) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '授权根目录不能是符号链接。')
    }
    if (!requestedStats.isDirectory()) {
      throw new PublicError('WORKSPACE_UNAVAILABLE', '所选位置不是可用的文件夹。')
    }
    const canonicalRoot = await realpath(requestedRoot)
    const rootStats = await stat(canonicalRoot)
    if (!rootStats.isDirectory()) {
      throw new PublicError('WORKSPACE_UNAVAILABLE', '所选位置不是可用的文件夹。')
    }
    return canonicalRoot
  } catch (error) {
    if (error instanceof PublicError) {
      throw error
    }
    throw new PublicError('WORKSPACE_UNAVAILABLE', '无法访问该模板工作区，请重新选择。')
  }
}

export async function resolveAuthorizedFile(
  rootPath: string,
  relativePath: string,
): Promise<{ absolutePath: string; sizeBytes: number }> {
  if (!relativePath || isAbsolute(relativePath)) {
    throw new PublicError('PATH_NOT_AUTHORIZED', '文件不在当前授权的模板工作区内。')
  }

  const canonicalRoot = await resolveAuthorizedRoot(rootPath)
  const lexicalCandidate = resolve(canonicalRoot, relativePath)
  if (!isPathInsideRoot(canonicalRoot, lexicalCandidate) || lexicalCandidate === canonicalRoot) {
    throw new PublicError('PATH_NOT_AUTHORIZED', '文件不在当前授权的模板工作区内。')
  }

  try {
    const linkStats = await lstat(lexicalCandidate)
    if (linkStats.isSymbolicLink()) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '符号链接文件不能作为模板打开。')
    }

    const canonicalFile = await realpath(lexicalCandidate)
    if (!isPathInsideRoot(canonicalRoot, canonicalFile)) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '文件不在当前授权的模板工作区内。')
    }

    const fileStats = await stat(canonicalFile)
    if (!fileStats.isFile()) {
      throw new PublicError('FILE_UNAVAILABLE', '模板文件当前不可用。')
    }

    return { absolutePath: canonicalFile, sizeBytes: fileStats.size }
  } catch (error) {
    if (error instanceof PublicError) {
      throw error
    }
    throw new PublicError('FILE_UNAVAILABLE', '模板文件当前不可用，可能已被移动或删除。')
  }
}
