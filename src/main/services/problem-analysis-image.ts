import { lstat, readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import type { ProblemAnalysisImage } from '@core/contracts/problem-analysis'

import { PublicError } from '../errors/public-error'
import type { AiCompletionImage } from './ai-provider-adapters'

export const MAX_ANALYSIS_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_ANALYSIS_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024

export interface DecodedProblemAnalysisImage extends AiCompletionImage {
  buffer: Buffer
  extension: '.jpg' | '.png' | '.webp'
  name: string
}

function detectImage(
  buffer: Buffer,
): Pick<DecodedProblemAnalysisImage, 'extension' | 'mediaType'> | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.subarray(1, 4).toString('ascii') === 'PNG' &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { extension: '.png', mediaType: 'image/png' }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', mediaType: 'image/jpeg' }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { extension: '.webp', mediaType: 'image/webp' }
  }
  return null
}

export function decodeProblemAnalysisImage(
  image: ProblemAnalysisImage,
): DecodedProblemAnalysisImage {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.dataUrl)
  if (!match?.[1] || !match[2]) {
    throw new PublicError('INVALID_REQUEST', '题目图片数据格式无效。')
  }
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0 || buffer.length > MAX_ANALYSIS_IMAGE_BYTES) {
    throw new PublicError('FILE_TOO_LARGE', '单张题目分析图片不能超过 8 MiB。')
  }
  const detected = detectImage(buffer)
  if (!detected || detected.mediaType !== match[1]) {
    throw new PublicError('INVALID_REQUEST', '图片内容与声明格式不一致。')
  }
  return {
    base64: match[2],
    buffer,
    dataUrl: image.dataUrl,
    extension: detected.extension,
    mediaType: detected.mediaType,
    name: image.name,
  }
}

export function decodeProblemAnalysisImages(
  images: ProblemAnalysisImage[],
): DecodedProblemAnalysisImage[] {
  const decoded = images.map(decodeProblemAnalysisImage)
  if (
    decoded.reduce((total, image) => total + image.buffer.length, 0) >
    MAX_ANALYSIS_TOTAL_IMAGE_BYTES
  ) {
    throw new PublicError('FILE_TOO_LARGE', '题目分析图片合计不能超过 24 MiB。')
  }
  return decoded
}

export async function readProblemAnalysisImage(path: string): Promise<ProblemAnalysisImage> {
  try {
    const stats = await lstat(path)
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_ANALYSIS_IMAGE_BYTES) {
      throw new PublicError('FILE_UNAVAILABLE', '所选图片不可读取或超过 8 MiB。')
    }
    const buffer = await readFile(path)
    const detected = detectImage(buffer)
    if (!detected) {
      throw new PublicError('INVALID_REQUEST', '仅支持真实的 PNG、JPEG 或 WebP 图片。')
    }
    return {
      dataUrl: `data:${detected.mediaType};base64,${buffer.toString('base64')}`,
      name: (basename(path).slice(0, 255) || '题目图片').normalize('NFC'),
    }
  } catch (error) {
    if (error instanceof PublicError) throw error
    throw new PublicError('FILE_UNAVAILABLE', '所选图片不可读取，请重新选择。')
  }
}
