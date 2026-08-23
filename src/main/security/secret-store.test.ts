import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { SecretStore, type SecretCipher } from './secret-store'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map(path => rm(path, { force: true, recursive: true })),
  )
})

const testCipher: SecretCipher = {
  decrypt: encrypted => Buffer.from(encrypted.toString('utf8'), 'base64').toString('utf8'),
  encrypt: plainText => Buffer.from(Buffer.from(plainText).toString('base64')),
  isAvailable: () => true,
  isSecureBackend: () => true,
}

describe('SecretStore', () => {
  it('stores only encrypted bytes and removes the referenced secret', async () => {
    const root = await mkdtemp(join(tmpdir(), 'algorithm-workbench-secret-test-'))
    temporaryPaths.push(root)
    const store = new SecretStore(root, testCipher)

    const reference = await store.write('super-secret-key')
    const raw = await readFile(join(root, 'secrets', reference), 'utf8')
    expect(raw).not.toContain('super-secret-key')
    await expect(store.read(reference)).resolves.toBe('super-secret-key')
    await store.delete(reference)
    await expect(store.read(reference)).rejects.toMatchObject({ code: 'AI_SECRET_UNAVAILABLE' })
  })

  it('refuses persistence when secure storage is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'algorithm-workbench-secret-test-'))
    temporaryPaths.push(root)
    const store = new SecretStore(root, { ...testCipher, isSecureBackend: () => false })
    await expect(store.write('never-written')).rejects.toMatchObject({
      code: 'AI_SECRET_STORAGE_UNAVAILABLE',
    })
  })
})
