/**
 * Normalizes postal codes according to UPU (Universal Postal Union) standards
 * and carrier requirements (such as DHL Parcel DE Shipping API).
 *
 * Handles:
 * - Removing leading/trailing dashes, slashes, dots, whitespace (e.g. "-5573" -> "5573")
 * - Stripping country prefixes (e.g. "L-5573", "D-53113", "AT-1010", "NL-1012 AB")
 * - Formatting countries with strict UPU patterns:
 *   - Luxembourg (LU/LUX): 4 digits (e.g. "5573")
 *   - Germany (DE/DEU): 5 digits (e.g. "53113")
 *   - Austria (AT/AUT): 4 digits (e.g. "1010")
 *   - Switzerland (CH/CHE), Liechtenstein (LI/LIE): 4 digits (e.g. "8001")
 *   - Belgium (BE/BEL): 4 digits (e.g. "1000")
 *   - Denmark (DK/DNK), Norway (NO/NOR): 4 digits (e.g. "1000")
 *   - France (FR/FRA), Monaco (MC/MCO): 5 digits (e.g. "75001")
 *   - Italy (IT/ITA), San Marino (SM/SMR), Vatican (VA/VAT): 5 digits (e.g. "00100")
 *   - Spain (ES/ESP): 5 digits (e.g. "28001")
 *   - Finland (FI/FIN): 5 digits (e.g. "00100")
 *   - Netherlands (NL/NLD): 4 digits + space + 2 uppercase letters (e.g. "1012 AB")
 *   - Poland (PL/POL): 2 digits + hyphen + 3 digits (e.g. "00-175")
 *   - Portugal (PT/PRT): 4 digits + hyphen + 3 digits (e.g. "1000-001")
 *   - Sweden (SE/SWE), Czechia (CZ/CZE), Slovakia (SK/SVK), Greece (GR/GRC): 3 digits + space + 2 digits (e.g. "110 00")
 *   - United Kingdom (GB/GBR): standard outward + space + inward code (e.g. "SW1A 1AA")
 */
export function normalizePostalCode(
  rawZip: string | null | undefined,
  country?: string | null
): string {
  if (!rawZip) return ''
  let zip = String(rawZip).trim()
  if (!zip) return ''

  const c = (country || '').trim().toUpperCase()

  // 1. Strip leading and trailing punctuation / dashes / slashes / spaces
  zip = zip.replace(/^[\s\-_./]+|[\s\-_./]+$/g, '')

  // 2. Strip country prefix if attached
  // E.g. "L-5573", "LU-5573", "LUX-5573", "D-53113", "DE-53113", "AT-1010", "NL-1012 AB"
  const prefixMatch = zip.match(/^([A-Za-z]{1,3})[-\s]+(.+)$/)
  if (prefixMatch) {
    const p = prefixMatch[1].toUpperCase()
    // For UK, don't strip outward code letters (e.g., SW1A 1AA, EC1A 1BB, etc.)
    if (c === 'GB' || c === 'GBR' || c === 'UK') {
      if (p === 'GB' || p === 'UK') {
        zip = prefixMatch[2].trim()
      }
    } else {
      zip = prefixMatch[2].trim()
    }
  }

  // 3. Country-specific UPU formatting
  const iso2 = c.length === 2 ? c : ''
  const iso3 = c.length === 3 ? c : ''

  // 4-digit numeric countries: LU, AT, CH, LI, BE, DK, NO
  if (
    iso2 === 'LU' || iso3 === 'LUX' ||
    iso2 === 'AT' || iso3 === 'AUT' ||
    iso2 === 'CH' || iso3 === 'CHE' ||
    iso2 === 'LI' || iso3 === 'LIE' ||
    iso2 === 'BE' || iso3 === 'BEL' ||
    iso2 === 'DK' || iso3 === 'DNK' ||
    iso2 === 'NO' || iso3 === 'NOR'
  ) {
    const digits = zip.replace(/\D/g, '')
    if (digits.length === 4) return digits
  }

  // 5-digit numeric countries: DE, FR, MC, IT, SM, VA, ES, FI
  if (
    iso2 === 'DE' || iso3 === 'DEU' ||
    iso2 === 'FR' || iso3 === 'FRA' ||
    iso2 === 'MC' || iso3 === 'MCO' ||
    iso2 === 'IT' || iso3 === 'ITA' ||
    iso2 === 'SM' || iso3 === 'SMR' ||
    iso2 === 'VA' || iso3 === 'VAT' ||
    iso2 === 'ES' || iso3 === 'ESP' ||
    iso2 === 'FI' || iso3 === 'FIN'
  ) {
    const digits = zip.replace(/\D/g, '')
    if (digits.length === 5) return digits
  }

  // Netherlands: 4 digits + space + 2 uppercase letters (e.g. 1012 AB)
  if (iso2 === 'NL' || iso3 === 'NLD') {
    const clean = zip.replace(/[\s\-_]/g, '').toUpperCase()
    if (/^\d{4}[A-Z]{2}$/.test(clean)) {
      return `${clean.slice(0, 4)} ${clean.slice(4)}`
    }
  }

  // Poland: 2 digits - 3 digits (e.g. 00-175)
  if (iso2 === 'PL' || iso3 === 'POL') {
    const digits = zip.replace(/\D/g, '')
    if (digits.length === 5) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`
    }
  }

  // Portugal: 4 digits - 3 digits (e.g. 1000-001)
  if (iso2 === 'PT' || iso3 === 'PRT') {
    const digits = zip.replace(/\D/g, '')
    if (digits.length === 7) {
      return `${digits.slice(0, 4)}-${digits.slice(4)}`
    }
  }

  // Sweden, Czechia, Slovakia, Greece: 3 digits + space + 2 digits (e.g. 110 00)
  if (['SE', 'SWE', 'CZ', 'CZE', 'SK', 'SVK', 'GR', 'GRC'].includes(iso2 || iso3)) {
    const digits = zip.replace(/\D/g, '')
    if (digits.length === 5) {
      return `${digits.slice(0, 3)} ${digits.slice(3)}`
    }
  }

  // United Kingdom: outward + space + inward (e.g. SW1A 1AA)
  if (iso2 === 'GB' || iso3 === 'GBR' || iso2 === 'UK') {
    const clean = zip.replace(/\s+/g, '').toUpperCase()
    const ukMatch = clean.match(/^([A-Z]{1,2}\d[A-Z\d]?\d?)(\d[A-Z]{2})$/)
    if (ukMatch) {
      return `${ukMatch[1]} ${ukMatch[2]}`
    }
  }

  return zip
}

/**
 * Splits a full street string into street name and house number.
 * Supports:
 * - Trailing house numbers (German/Austrian standard): "Musterstraße 12", "Hauptstr. 12a", "Straße des 17. Juni 135"
 * - Leading house numbers (French/Luxembourg/UK/US standard): "6 Montée St. Urbain", "12, Rue de la Paix", "10 Downing Street"
 * - Fallback when no number is found: keeps entire street, sets houseNo to "."
 */
export function splitStreet(full: string | null | undefined): { street: string; houseNo: string } {
  if (!full) return { street: '', houseNo: '.' }
  const trimmed = full.trim()

  // 1. Try trailing house number (e.g. "Musterstraße 12", "Hauptstr. 12a", "Bahnhofstr. 10-12", "Allee 74/1")
  const trailingMatch = trimmed.match(/^(.+?)\s+([\d\-\/]+\s*[a-zA-Z]?)$/)
  if (trailingMatch) {
    return { street: trailingMatch[1].trim(), houseNo: trailingMatch[2].trim().slice(0, 10) }
  }

  // 2. Try leading house number (e.g. "6 Montée St. Urbain", "12, Rue de la Paix", "10 Downing Street")
  const leadingMatch = trimmed.match(/^([\d\-\/]+\s*[a-zA-Z]?)[,\s]+(.+)$/)
  if (leadingMatch) {
    return { street: leadingMatch[2].trim(), houseNo: leadingMatch[1].trim().slice(0, 10) }
  }

  // 3. Fallback: no clearly recognizable number
  return { street: trimmed, houseNo: '.' }
}
