import { describe, expect, it } from 'vitest'

import { decodeProblemAnalysisImage, decodeProblemAnalysisImages } from './problem-analysis-image'

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('problem analysis image validation', () => {
  it('accepts a real PNG and derives trusted metadata from magic bytes', () => {
    const image = decodeProblemAnalysisImage({ dataUrl: pngDataUrl, name: 'problem.png' })
    expect(image).toMatchObject({
      extension: '.png',
      mediaType: 'image/png',
      name: 'problem.png',
    })
    expect(image.buffer.length).toBeGreaterThan(0)
  })

  it('rejects a MIME declaration that does not match the file bytes', () => {
    expect(() =>
      decodeProblemAnalysisImage({
        dataUrl: pngDataUrl.replace('image/png', 'image/jpeg'),
        name: 'forged.jpg',
      }),
    ).toThrow('图片内容与声明格式不一致')
  })

  it('keeps decoded image batches bounded', () => {
    expect(decodeProblemAnalysisImages([{ dataUrl: pngDataUrl, name: 'one.png' }])).toHaveLength(1)
  })
})
