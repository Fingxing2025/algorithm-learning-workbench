import { createHash } from 'node:crypto'

export const TEMPLATE_INDEX_VERSION = 2
export const MAX_INDEXED_SOURCE_BYTES = 2 * 1024 * 1024

export interface SimilaritySignature {
  hashes: string[]
  normalizedLength: number
  version: 1
}

export function normalizeSourceForComparison(source: string): string {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sourceShingles(source: string): Set<string> {
  const tokens = source.toLocaleLowerCase('en-US').match(/[a-z_]\w*|\d+(?:\.\d+)?|[^\s\w]/g) ?? []
  if (tokens.length < 5) return new Set(tokens.length > 0 ? [tokens.join(' ')] : [])
  const shingles = new Set<string>()
  for (let index = 0; index <= tokens.length - 5 && shingles.size < 4_000; index += 1) {
    shingles.add(tokens.slice(index, index + 5).join(' '))
  }
  return shingles
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  const [small, large] = left.size <= right.size ? [left, right] : [right, left]
  let intersection = 0
  for (const value of small) if (large.has(value)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

export function buildSimilaritySignature(normalizedSource: string): SimilaritySignature {
  const hashes = [...sourceShingles(normalizedSource)]
    .map(shingle => createHash('sha256').update(shingle).digest('hex').slice(0, 16))
    .sort()
    .slice(0, 64)
  return { hashes, normalizedLength: normalizedSource.length, version: 1 }
}

export function parseSimilaritySignature(value: string | null): SimilaritySignature | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<SimilaritySignature>
    if (
      parsed.version !== 1 ||
      !Number.isInteger(parsed.normalizedLength) ||
      (parsed.normalizedLength ?? -1) < 0 ||
      !Array.isArray(parsed.hashes) ||
      parsed.hashes.length > 64 ||
      parsed.hashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{16}$/u.test(hash))
    ) {
      return null
    }
    return {
      hashes: [...new Set(parsed.hashes)].sort(),
      normalizedLength: parsed.normalizedLength!,
      version: 1,
    }
  } catch {
    return null
  }
}

export function similarityCandidateKeys(
  extension: string,
  signature: SimilaritySignature,
): string[] {
  if (signature.hashes.length === 0 || signature.normalizedLength === 0) return []
  const lengthBucket = Math.floor(Math.log(signature.normalizedLength) / Math.log(1.15))
  const keys: string[] = []
  for (const hash of signature.hashes.slice(0, 24)) {
    for (let bucket = lengthBucket - 1; bucket <= lengthBucket + 1; bucket += 1) {
      keys.push(`${extension}:${bucket}:${hash}`)
    }
  }
  return keys
}
