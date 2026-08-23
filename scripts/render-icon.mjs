import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { chromium } from '@playwright/test'

const sourcePath = resolve('build/icon.svg')
const outputPath = resolve('build/icon.png')
const source = await readFile(sourcePath, 'utf8')
const sourceUrl = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage({ viewport: { height: 1024, width: 1024 } })
  await page.setContent(
    `<style>html,body{width:100%;height:100%;margin:0;background:transparent}img{display:block;width:1024px;height:1024px}</style><img alt="App icon" src="${sourceUrl}">`,
  )
  await page.getByRole('img', { name: 'App icon' }).evaluate(image => {
    if (image.tagName !== 'IMG' || !image.complete || image.naturalWidth !== 1024) {
      throw new Error('The SVG icon did not render at 1024 px.')
    }
  })
  await page.screenshot({ omitBackground: true, path: outputPath })
} finally {
  await browser.close()
}
