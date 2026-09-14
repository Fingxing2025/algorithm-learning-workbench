import { describe, expect, it } from 'vitest'

import {
  createClassificationFingerprint,
  createClassificationTargetFingerprint,
} from './template-classification-fingerprint'

describe('template classification fingerprints', () => {
  it('is stable across object key order and ignores undefined properties', () => {
    expect(createClassificationFingerprint({ a: 1, b: [2, { c: 3 }] })).toBe(
      createClassificationFingerprint({ b: [2, { c: 3, ignored: undefined }], a: 1 }),
    )
  })

  it('normalizes target paths to NFC', () => {
    expect(createClassificationTargetFingerprint('string/café.cpp')).toBe(
      createClassificationTargetFingerprint('string/cafe\u0301.cpp'),
    )
  })
})
