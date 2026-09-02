import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const installerPath = fileURLToPath(
  new URL('../install-macos-preview.sh', import.meta.url),
)

test('macOS preview installer targets the RC5 artifact and resumes interrupted downloads', async () => {
  const installer = await readFile(installerPath, 'utf8')

  assert.match(installer, /release_tag='v0\.1\.3-rc\.5'/)
  assert.match(
    installer,
    /expected_dmg_sha256='adf9c9ec37305c857259c299b7eff34750302cf681053680fbf57abfadf85196'/,
  )
  assert.match(installer, /curl --fail --location --continue-at - --output "\$dmg_path"/)
  assert.match(installer, /while ! curl/)
  assert.match(installer, /Stopped without replacing the existing app/)
  assert.match(installer, /xattr -dr com\.apple\.quarantine "\$destination"/)
})
