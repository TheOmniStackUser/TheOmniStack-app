import zlib from 'zlib'
import { XMLParser } from 'fast-xml-parser'

// ─── CRC32 Table for ZIP creation ─────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[n] = c >>> 0
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createZipBuffer(files: { name: string; data: Buffer }[]): Buffer {
  const localHeaders: Buffer[] = []
  const centralHeaders: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const uncompressedSize = file.data.length
    const crc = crc32(file.data)
    const compressedData = zlib.deflateRawSync(file.data)
    const compressedSize = compressedData.length

    // Local file header (30 bytes + file name)
    const localHeader = Buffer.alloc(30 + nameBuf.length)
    localHeader.writeUInt32LE(0x04034b50, 0) // signature
    localHeader.writeUInt16LE(20, 4) // version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6) // general purpose bit flag (UTF-8)
    localHeader.writeUInt16LE(8, 8) // compression method (8 = deflate)
    localHeader.writeUInt16LE(0, 10) // last mod file time
    localHeader.writeUInt16LE(0x5421, 12) // last mod file date
    localHeader.writeUInt32LE(crc, 14) // crc-32
    localHeader.writeUInt32LE(compressedSize, 18) // compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22) // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26) // file name length
    localHeader.writeUInt16LE(0, 28) // extra field length
    nameBuf.copy(localHeader, 30)

    localHeaders.push(localHeader, compressedData)

    // Central directory file header (46 bytes + file name)
    const centralHeader = Buffer.alloc(46 + nameBuf.length)
    centralHeader.writeUInt32LE(0x02014b50, 0) // signature
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8) // general purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(8, 10) // compression method (8 = deflate)
    centralHeader.writeUInt16LE(0, 12) // last mod file time
    centralHeader.writeUInt16LE(0x5421, 14) // last mod file date
    centralHeader.writeUInt32LE(crc, 16) // crc-32
    centralHeader.writeUInt32LE(compressedSize, 20) // compressed size
    centralHeader.writeUInt32LE(uncompressedSize, 24) // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28) // file name length
    centralHeader.writeUInt16LE(0, 30) // extra field length
    centralHeader.writeUInt16LE(0, 32) // file comment length
    centralHeader.writeUInt16LE(0, 34) // disk number start
    centralHeader.writeUInt16LE(0, 36) // internal file attributes
    centralHeader.writeUInt32LE(0, 38) // external file attributes
    centralHeader.writeUInt32LE(offset, 42) // relative offset of local header
    nameBuf.copy(centralHeader, 46)

    centralHeaders.push(centralHeader)
    offset += localHeader.length + compressedData.length
  }

  const centralDirectorySize = centralHeaders.reduce((sum, b) => sum + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // End of central directory signature
  eocd.writeUInt16LE(0, 4) // number of this disk
  eocd.writeUInt16LE(0, 6) // disk where central directory starts
  eocd.writeUInt16LE(files.length, 8) // number of central directory records on this disk
  eocd.writeUInt16LE(files.length, 10) // total number of central directory records
  eocd.writeUInt32LE(centralDirectorySize, 12) // size of central directory
  eocd.writeUInt32LE(offset, 16) // offset of start of central directory
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd])
}

function extractZipEntries(zipBuffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>()
  // Locate End of Central Directory (EOCD)
  let eocdOffset = -1
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Ungültige Excel-Datei (ZIP-Signatur nicht gefunden).')
  }

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10)
  let cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16)

  for (let i = 0; i < totalEntries; i++) {
    if (zipBuffer.readUInt32LE(cdOffset) !== 0x02014b50) break
    const compressionMethod = zipBuffer.readUInt16LE(cdOffset + 10)
    const compressedSize = zipBuffer.readUInt32LE(cdOffset + 20)
    const fileNameLen = zipBuffer.readUInt16LE(cdOffset + 28)
    const extraLen = zipBuffer.readUInt16LE(cdOffset + 30)
    const commentLen = zipBuffer.readUInt16LE(cdOffset + 32)
    const localHeaderOffset = zipBuffer.readUInt32LE(cdOffset + 42)
    const fileName = zipBuffer.subarray(cdOffset + 46, cdOffset + 46 + fileNameLen).toString('utf8')

    // Read local file header to find data offset
    const localFileNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen
    const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)

    if (compressionMethod === 0) {
      entries.set(fileName, Buffer.from(compressedData))
    } else if (compressionMethod === 8) {
      entries.set(fileName, zlib.inflateRawSync(compressedData))
    }

    cdOffset += 46 + fileNameLen + extraLen + commentLen
  }

  return entries
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip control characters invalid in XML 1.0
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

function columnIndexToLetter(index: number): string {
  let letter = ''
  let temp = index
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter
    temp = Math.floor(temp / 26) - 1
  }
  return letter
}

function columnLetterToIndex(letters: string): number {
  let index = 0
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64)
  }
  return index - 1
}

export type ExcelColumnDef = {
  header: string
  key: string
  width?: number
  type?: 'string' | 'number' | 'currency' | 'integer' | 'percent'
}

export type GenerateExcelOptions = {
  sheetName?: string
  columns: ExcelColumnDef[]
  rows: Record<string, any>[]
  summaryRow?: Record<string, any>
}

/**
 * Generates a native .xlsx Buffer with styled headers, column widths, and number formats.
 * Style indices in styles.xml:
 * 0 = Default
 * 1 = Header (bold, dark slate fill #0F172A, white text)
 * 2 = Text cell
 * 3 = Integer (#,##0)
 * 4 = Decimal / Number (#,##0.00)
 * 5 = Currency (#,##0.00 "€")
 * 6 = Percent (0.0%)
 * 7 = Summary Text (bold, light slate fill #F1F5F9, top border)
 * 8 = Summary Integer (bold, light slate fill #F1F5F9, #,##0)
 * 9 = Summary Currency (bold, light slate fill #F1F5F9, #,##0.00 "€")
 */
export function generateExcelBuffer(options: GenerateExcelOptions): Buffer {
  const sheetName = escapeXml((options.sheetName || 'Inventur').slice(0, 31))
  const { columns, rows, summaryRow } = options

  const colsXml = columns
    .map((col, idx) => {
      const colNum = idx + 1
      const width = col.width || Math.max(col.header.length + 5, 14)
      return `<col min="${colNum}" max="${colNum}" width="${width}" customWidth="1"/>`
    })
    .join('')

  const xmlRows: string[] = []

  // 1. Header Row (row 1)
  const headerCells = columns
    .map((col, colIdx) => {
      const ref = `${columnIndexToLetter(colIdx)}1`
      return `<c r="${ref}" s="1" t="inlineStr"><is><t>${escapeXml(col.header)}</t></is></c>`
    })
    .join('')
  xmlRows.push(`<row r="1" ht="24" customHeight="1">${headerCells}</row>`)

  // 2. Data Rows
  rows.forEach((row, rowIdx) => {
    const rNum = rowIdx + 2
    const cells = columns
      .map((col, colIdx) => {
        const ref = `${columnIndexToLetter(colIdx)}${rNum}`
        const rawVal = row[col.key]

        if (rawVal === null || rawVal === undefined || rawVal === '') {
          return `<c r="${ref}" s="2" t="inlineStr"><is><t></t></is></c>`
        }

        if (col.type === 'currency' || col.type === 'number' || col.type === 'integer' || col.type === 'percent') {
          const num = typeof rawVal === 'number' ? rawVal : Number(String(rawVal).replace(',', '.'))
          if (!isNaN(num)) {
            const styleIdx =
              col.type === 'integer' ? 3 : col.type === 'currency' ? 5 : col.type === 'percent' ? 6 : 4
            return `<c r="${ref}" s="${styleIdx}" t="n"><v>${num}</v></c>`
          }
        }

        return `<c r="${ref}" s="2" t="inlineStr"><is><t>${escapeXml(String(rawVal))}</t></is></c>`
      })
      .join('')
    xmlRows.push(`<row r="${rNum}" ht="19">${cells}</row>`)
  })

  // 3. Optional Summary Row
  if (summaryRow) {
    const rNum = rows.length + 2
    const cells = columns
      .map((col, colIdx) => {
        const ref = `${columnIndexToLetter(colIdx)}${rNum}`
        const rawVal = summaryRow[col.key]

        if (rawVal === null || rawVal === undefined || rawVal === '') {
          return `<c r="${ref}" s="7" t="inlineStr"><is><t></t></is></c>`
        }

        if (col.type === 'currency' || col.type === 'number' || col.type === 'integer') {
          const num = typeof rawVal === 'number' ? rawVal : Number(String(rawVal).replace(',', '.'))
          if (!isNaN(num)) {
            const styleIdx = col.type === 'integer' ? 8 : 9
            return `<c r="${ref}" s="${styleIdx}" t="n"><v>${num}</v></c>`
          }
        }

        return `<c r="${ref}" s="7" t="inlineStr"><is><t>${escapeXml(String(rawVal))}</t></is></c>`
      })
      .join('')
    xmlRows.push(`<row r="${rNum}" ht="22" customHeight="1">${cells}</row>`)
  }

  const lastColLetter = columnIndexToLetter(Math.max(0, columns.length - 1))
  const lastDataRow = rows.length + 1

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>${xmlRows.join('')}</sheetData>
  <autoFilter ref="A1:${lastColLetter}${lastDataRow}"/>
</worksheet>`

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0.00\ &quot;€&quot;"/>
    <numFmt numFmtId="165" formatCode="0.0%"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
    <border>
      <top style="medium"><color rgb="FF94A3B8"/></top>
      <bottom style="double"><color rgb="FF94A3B8"/></bottom>
      <left/><right/><diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="3" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${sheetName}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

  return createZipBuffer([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRelsXml, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRelsXml, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
  ])
}

export function decodeExcelString(input: string): string {
  if (!input) return ''
  let str = input
  // Decode up to 2 passes in case of double-escaped entities like &amp;#252;
  for (let pass = 0; pass < 2; pass++) {
    const prev = str
    str = str
      .replace(/&#(\d+);/g, (_, dec) => {
        const code = parseInt(dec, 10)
        return !isNaN(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        const code = parseInt(hex, 16)
        return !isNaN(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _
      })
      .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => {
        const code = parseInt(hex, 16)
        return !isNaN(code) ? String.fromCharCode(code) : _
      })
      .replace(/&auml;/g, 'ä')
      .replace(/&ouml;/g, 'ö')
      .replace(/&uuml;/g, 'ü')
      .replace(/&Auml;/g, 'Ä')
      .replace(/&Ouml;/g, 'Ö')
      .replace(/&Uuml;/g, 'Ü')
      .replace(/&szlig;/g, 'ß')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    if (str === prev) break
  }
  return str.normalize('NFC')
}

/**
 * Parses the first worksheet of an .xlsx file buffer into an array of row objects
 * keyed by the header row (row 1).
 */
export function parseExcelBuffer(xlsxBuffer: Buffer): Record<string, string>[] {
  const entries = extractZipEntries(xlsxBuffer)
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: false,
    htmlEntities: true,
  })

  // 1. Parse shared strings if present
  const sharedStrings: string[] = []
  const sharedStringsBuf = entries.get('xl/sharedStrings.xml')
  if (sharedStringsBuf) {
    const sstObj = parser.parse(sharedStringsBuf.toString('utf8'))
    const siList = sstObj?.sst?.si
    const items = Array.isArray(siList) ? siList : siList ? [siList] : []
    for (const si of items) {
      if (typeof si?.t === 'string') {
        sharedStrings.push(decodeExcelString(si.t))
      } else if (si?.t && typeof si.t['#text'] !== 'undefined') {
        sharedStrings.push(decodeExcelString(String(si.t['#text'])))
      } else if (si?.r) {
        // Rich text runs
        const runs = Array.isArray(si.r) ? si.r : [si.r]
        const text = runs
          .map((r: any) => (typeof r?.t === 'string' ? r.t : r?.t?.['#text'] || ''))
          .join('')
        sharedStrings.push(decodeExcelString(text))
      } else {
        sharedStrings.push('')
      }
    }
  }

  // 2. Find first worksheet
  let sheetBuf = entries.get('xl/worksheets/sheet1.xml')
  if (!sheetBuf) {
    for (const [name, buf] of entries.entries()) {
      if (name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml')) {
        sheetBuf = buf
        break
      }
    }
  }
  if (!sheetBuf) {
    throw new Error('Kein Tabellenblatt in der Excel-Datei gefunden.')
  }

  const sheetObj = parser.parse(sheetBuf.toString('utf8'))
  const rawRows = sheetObj?.worksheet?.sheetData?.row
  const rowList = Array.isArray(rawRows) ? rawRows : rawRows ? [rawRows] : []
  if (rowList.length === 0) return []

  const extractCellValue = (cell: any): string => {
    if (!cell) return ''
    const type = cell['@_t']
    if (type === 'inlineStr') {
      const isNode = cell.is
      if (typeof isNode?.t === 'string') return decodeExcelString(isNode.t)
      if (isNode?.t && typeof isNode.t['#text'] !== 'undefined') return decodeExcelString(String(isNode.t['#text']))
      if (isNode?.r) {
        const runs = Array.isArray(isNode.r) ? isNode.r : [isNode.r]
        const text = runs
          .map((r: any) => (typeof r?.t === 'string' ? r.t : r?.t?.['#text'] || ''))
          .join('')
        return decodeExcelString(text)
      }
      return ''
    }
    const rawV = cell.v
    const valStr = typeof rawV === 'object' && rawV !== null ? String(rawV['#text'] ?? '') : String(rawV ?? '')
    if (type === 's') {
      const idx = parseInt(valStr, 10)
      return !isNaN(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : decodeExcelString(valStr)
    }
    return decodeExcelString(valStr)
  }

  // Parse all rows into sparse arrays of strings by column index
  const parsedMatrix: string[][] = []
  for (const r of rowList) {
    const rawCells = r?.c
    const cells = Array.isArray(rawCells) ? rawCells : rawCells ? [rawCells] : []
    const rowArr: string[] = []
    let nextIdx = 0
    for (const c of cells) {
      const ref = c?.['@_r'] as string | undefined
      let colIdx = nextIdx
      if (ref) {
        const match = ref.match(/^([A-Z]+)/i)
        if (match) {
          colIdx = columnLetterToIndex(match[1].toUpperCase())
        }
      }
      rowArr[colIdx] = extractCellValue(c).trim()
      nextIdx = colIdx + 1
    }
    parsedMatrix.push(rowArr)
  }

  const headers = parsedMatrix[0] || []
  const result: Record<string, string>[] = []

  for (let i = 1; i < parsedMatrix.length; i++) {
    const rowArr = parsedMatrix[i]
    if (!rowArr || rowArr.every(v => !v)) continue
    const obj: Record<string, string> = {}
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const headerName = headers[colIdx]?.trim()
      if (headerName) {
        obj[headerName] = rowArr[colIdx] ?? ''
      }
    }
    result.push(obj)
  }

  return result
}
