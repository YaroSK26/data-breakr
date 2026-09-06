// scripts/ingest/zip.test.ts
import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { unzipFirstEntry } from './zip'

// Postaví minimálny jednosúborový ZIP presne v tvare, aký posiela FS SR
// (lokálna hlavička + dáta, žiadny centrálny adresár netreba čítať).
function buildZip(fileName: string, content: string, method: 0 | 8): Buffer {
  const nameBuf = Buffer.from(fileName, 'utf-8')
  const data = method === 8 ? deflateRawSync(Buffer.from(content, 'utf-8')) : Buffer.from(content, 'utf-8')

  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4) // version needed
  header.writeUInt16LE(0, 6) // flags
  header.writeUInt16LE(method, 8)
  header.writeUInt16LE(0, 10) // mod time
  header.writeUInt16LE(0, 12) // mod date
  header.writeUInt32LE(0, 14) // crc32 (nepoužíva sa pri čítaní)
  header.writeUInt32LE(data.length, 18) // compressed size
  header.writeUInt32LE(content.length, 22) // uncompressed size
  header.writeUInt16LE(nameBuf.length, 26)
  header.writeUInt16LE(0, 28) // extra field length

  return Buffer.concat([header, nameBuf, data])
}

describe('unzipFirstEntry', () => {
  it('rozbalí deflate-kompresovaný súbor (metóda 8, tá, ktorú FS SR posiela)', () => {
    const zip = buildZip('ds_dsdd.xml', '<xml>obsah so slovenskou diakritikou áäčšž</xml>', 8)

    expect(unzipFirstEntry(zip)).toBe('<xml>obsah so slovenskou diakritikou áäčšž</xml>')
  })

  it('prečíta aj nekomprimovaný súbor (metóda 0)', () => {
    const zip = buildZip('data.txt', 'plain content', 0)

    expect(unzipFirstEntry(zip)).toBe('plain content')
  })

  it('zamietne vstup, ktorý nezačína lokálnou ZIP hlavičkou', () => {
    expect(() => unzipFirstEntry(Buffer.from('not a zip'))).toThrow(/platný ZIP/)
  })
})
