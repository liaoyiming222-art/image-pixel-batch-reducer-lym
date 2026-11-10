import { expect, it } from 'vitest'
import JSZip from 'jszip'
import { extractPictures, hashDistance, hashPixels } from './similarity'

it('compares 256-bit image gradients and counts changed bits', () => {
  const pixels = new Uint8ClampedArray(17 * 16 * 4)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 17; x++) {
    const offset = (y * 17 + x) * 4
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255 - x * 10
    pixels[offset + 3] = 255
  }
  const hash = hashPixels(pixels)
  expect(hash).toBe('1'.repeat(256))
  expect(hashDistance(hash, hash)).toBe(0)
  expect(hashDistance(hash, '0' + hash.slice(1))).toBe(1)
})
it('extracts only embedded pictures from an Excel archive', async () => {
  const zip = new JSZip()
  zip.file('xl/media/image1.png', 'picture')
  zip.file('xl/worksheets/sheet1.xml', '<sheet/>')
  const data = await zip.generateAsync({ type: 'arraybuffer' })
  const file = new File([], 'queries.xlsx')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => data })
  const pictures = await extractPictures(file)
  expect(pictures.map(picture => picture.name)).toEqual(['queries.xlsx · image1.png'])
})
