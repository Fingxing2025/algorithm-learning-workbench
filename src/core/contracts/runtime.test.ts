import { describe, expect, it } from 'vitest'

import { runtimeInfoSchema } from './runtime'

describe('runtimeInfoSchema', () => {
  it('accepts a supported desktop runtime', () => {
    expect(
      runtimeInfoSchema.parse({
        appVersion: '0.1.0',
        electronVersion: '43.1.0',
        isPackaged: false,
        platform: 'darwin',
      }),
    ).toEqual({
      appVersion: '0.1.0',
      electronVersion: '43.1.0',
      isPackaged: false,
      platform: 'darwin',
    })
  })

  it('rejects unsupported platforms and unknown fields', () => {
    expect(() =>
      runtimeInfoSchema.parse({
        appVersion: '0.1.0',
        electronVersion: '43.1.0',
        isPackaged: false,
        platform: 'aix',
        secret: 'must-not-cross-ipc',
      }),
    ).toThrow()
  })
})
