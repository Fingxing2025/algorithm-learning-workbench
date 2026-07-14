import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { safeStorage } from 'electron'

import { PublicError } from '../errors/public-error'

export interface SecretCipher {
  decrypt: (encrypted: Buffer) => string
  encrypt: (plainText: string) => Buffer
  isAvailable: () => boolean
  isSecureBackend: () => boolean
}

export class ElectronSecretCipher implements SecretCipher {
  decrypt(encrypted: Buffer): string {
    return safeStorage.decryptString(encrypted)
  }

  encrypt(plainText: string): Buffer {
    return safeStorage.encryptString(plainText)
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  isSecureBackend(): boolean {
    return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'
  }
}

const SECRET_REFERENCE_PATTERN = /^[0-9a-f-]{36}\.secret$/i
const MAX_ENCRYPTED_SECRET_BYTES = 128 * 1024

export class SecretStore {
  private readonly secretDirectory: string

  constructor(
    userDataPath: string,
    private readonly cipher: SecretCipher = new ElectronSecretCipher(),
  ) {
    this.secretDirectory = join(userDataPath, 'secrets')
  }

  async delete(secretRef: string | null): Promise<void> {
    if (!secretRef || !SECRET_REFERENCE_PATTERN.test(secretRef)) return
    await unlink(join(this.secretDirectory, secretRef)).catch(() => undefined)
  }

  async read(secretRef: string | null): Promise<string | null> {
    if (!secretRef) return null
    if (!SECRET_REFERENCE_PATTERN.test(secretRef)) {
      throw new PublicError('AI_SECRET_UNAVAILABLE', '密钥引用无效，请重新输入 API Key。')
    }
    try {
      const secretPath = join(this.secretDirectory, secretRef)
      const stats = await lstat(secretPath)
      if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_ENCRYPTED_SECRET_BYTES) {
        throw new Error('invalid secret file')
      }
      const encrypted = await readFile(secretPath)
      return this.cipher.decrypt(encrypted)
    } catch {
      throw new PublicError('AI_SECRET_UNAVAILABLE', '无法读取已保存密钥，请重新输入 API Key。')
    }
  }

  async write(secret: string): Promise<string> {
    if (!secret.trim()) {
      throw new PublicError('INVALID_REQUEST', 'API Key 不能为空。')
    }
    if (!this.cipher.isAvailable() || !this.cipher.isSecureBackend()) {
      throw new PublicError(
        'AI_SECRET_STORAGE_UNAVAILABLE',
        '系统安全存储不可用，未保存 API Key。请先启用系统密钥环。',
      )
    }
    await mkdir(this.secretDirectory, { mode: 0o700, recursive: true })
    await chmod(this.secretDirectory, 0o700).catch(() => undefined)
    const secretRef = `${randomUUID()}.secret`
    const finalPath = join(this.secretDirectory, secretRef)
    const temporaryPath = `${finalPath}.tmp`
    try {
      await writeFile(temporaryPath, this.cipher.encrypt(secret), { flag: 'wx', mode: 0o600 })
      await rename(temporaryPath, finalPath)
      await chmod(finalPath, 0o600).catch(() => undefined)
      return secretRef
    } catch {
      await unlink(temporaryPath).catch(() => undefined)
      throw new PublicError('AI_SECRET_STORAGE_UNAVAILABLE', '无法安全保存 API Key，请重试。')
    }
  }
}
