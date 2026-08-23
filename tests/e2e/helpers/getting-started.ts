import type { Page } from '@playwright/test'

const gettingStartedSeenStorageKey = 'ui:getting-started:v1:seen'

export async function dismissGettingStartedGuideIfNeeded(page: Page) {
  const alreadySeen = await page
    .evaluate(key => globalThis.localStorage.getItem(key) === 'true', gettingStartedSeenStorageKey)
    .catch(() => false)
  if (!alreadySeen) {
    const dismissButton = page.getByTestId('getting-started-dismiss')
    await dismissButton.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => undefined)
    if (await dismissButton.isVisible()) await dismissButton.click()
  }

  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 10_000 })
}
