// scripts/ingest/zip.ts
//
// Minimálny čítač ZIP archívu pre jeden súbor vnútri (presne to, čo FS SR
// posiela - "ds_dsdd.zip" obsahuje len "ds_dsdd.xml"). Žiadna nová
// závislosť: FS zip používa metódu 8 (deflate), ktorú vie natívne
// rozbaliť node:zlib.inflateRawSync - stačí nájsť lokálnu hlavičku súboru
// v archíve a preskočiť jej pevnú aj premenlivú časť.
import { inflateRawSync } from 'node:zlib'

const LOCAL_HEADER_SIGNATURE = 0x04034b50

/** Rozbalí prvý súbor v ZIP archíve a vráti jeho obsah ako UTF-8 text. */
export function unzipFirstEntry(zipBuffer: Buffer): string {
  if (zipBuffer.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error('Nie je to platný ZIP súbor (chýba lokálna hlavička na začiatku)')
  }

  const compressionMethod = zipBuffer.readUInt16LE(8)
  const compressedSize = zipBuffer.readUInt32LE(18)
  const fileNameLength = zipBuffer.readUInt16LE(26)
  const extraFieldLength = zipBuffer.readUInt16LE(28)

  const dataStart = 30 + fileNameLength + extraFieldLength
  const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)

  if (compressionMethod === 0) {
    // Uložené bez kompresie.
    return compressedData.toString('utf-8')
  }
  if (compressionMethod === 8) {
    return inflateRawSync(compressedData).toString('utf-8')
  }
  throw new Error(`Nepodporovaná metóda kompresie v ZIP: ${compressionMethod}`)
}
