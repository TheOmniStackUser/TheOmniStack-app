export const COLOR_KEYWORDS = [
  'hellgrau', 'dunkelgrau', 'anthrazit', 'grau', 'grey', 'gray',
  'dunkelblau', 'hellblau', 'marine', 'navy', 'tuerkis', 'türkis', 'cyan', 'petrol', 'royalblau', 'blau', 'blue',
  'dunkelrot', 'weinrot', 'bordeaux', 'rosa', 'pink', 'magenta', 'coral', 'koralle', 'rot', 'red',
  'dunkelgruen', 'dunkelgrün', 'hellgruen', 'hellgrün', 'olive', 'khaki', 'mint', 'salbei', 'gruen', 'grün', 'green',
  'senfgelb', 'gelb', 'yellow', 'orange',
  'dunkelbraun', 'hellbraun', 'cognac', 'camel', 'beige', 'sand', 'natur', 'taupe', 'braun', 'brown',
  'violett', 'aubergine', 'flieder', 'berry', 'beere', 'lila', 'purple',
  'silber', 'silver', 'gold', 'bronze',
  'schwarz', 'black', 'weiss', 'weiß', 'white',
  'bunt', 'multi', 'farbmix', 'camo', 'camouflage', 'leopard', 'leo'
]

export interface VariantExtractionResult {
  color: string | null
  size: string | null
}

export function extractSizeAndColor(
  sku?: string | null,
  title?: string | null,
  rawPayload?: unknown
): VariantExtractionResult {
  let color: string | null = null
  let size: string | null = null

  // 1. Try to extract from raw marketplace payload (e.g. Otto, Shopify, Amazon)
  if (rawPayload && typeof rawPayload === 'object') {
    const payload = rawPayload as Record<string, any>
    
    // Otto attributes
    const attrs = payload.productDescription?.attributes || payload.attributes
    if (Array.isArray(attrs)) {
      for (const attr of attrs) {
        const name = (attr.name || '').toLowerCase()
        const val = Array.isArray(attr.values) && attr.values[0] ? String(attr.values[0]).trim() : null
        if (!val) continue

        if (!color && (name === 'farbe' || name === 'grundfarbe' || name === 'color')) {
          color = val
        }
        if (!size && (name === 'ausgabegröße' || name === 'gürtelgrößen' || name.includes('größe') || name.includes('groesse') || name === 'size')) {
          size = val
        }
      }
    }

    // Shopify options / variants
    if (!color || !size) {
      if (Array.isArray(payload.options)) {
        for (const opt of payload.options) {
          const name = (opt.name || '').toLowerCase()
          if (!color && (name === 'color' || name === 'farbe')) {
            if (Array.isArray(opt.values) && opt.values[0]) color = String(opt.values[0]).trim()
          }
          if (!size && (name === 'size' || name === 'größe' || name === 'groesse')) {
            if (Array.isArray(opt.values) && opt.values[0]) size = String(opt.values[0]).trim()
          }
        }
      }
    }
  }

  // 2. Parse from SKU if missing
  if (sku) {
    const tokens = sku.split(/[-_]/)

    // Check size from tokens (from right to left)
    if (!size) {
      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i].trim()
        if (!t) continue

        // Standard clothing size: XS, S, M, L, XL, XXL, 2XL - 6XL, OneSize, OS
        if (/^([1-9]?[0-9]?X+[SL]|[SML]|OneSize|OS)$/i.test(t)) {
          size = t.toUpperCase()
          break
        }
        // Kids sizes: Gr116, Gr122, Gr.128, etc.
        const kidsMatch = t.match(/^Gr\.?(\d{2,3})$/i)
        if (kidsMatch) {
          size = kidsMatch[1]
          break
        }
        // Shoe / clothing number sizes: 34 to 52
        if (/^(3[4-9]|4[0-9]|5[0-2])$/.test(t)) {
          size = t
          break
        }
        // Belt sizes: 70 to 140
        if (/^(6[5-9]|[7-9][0-9]|1[0-5][0-9])$/.test(t)) {
          size = t
          break
        }
        // Dimensions e.g. 43x34, 110x95
        if (/^\d{2,3}x\d{2,3}$/i.test(t)) {
          size = t
          break
        }
        // Combined color+shoeSize like GRUEN46
        const combinedMatch = t.match(/^([a-zA-Z]+)(3[4-9]|4[0-9]|5[0-2])$/)
        if (combinedMatch) {
          const possibleColor = combinedMatch[1].toLowerCase()
          if (COLOR_KEYWORDS.some(c => possibleColor.includes(c))) {
            size = combinedMatch[2]
            if (!color) {
              const matched = COLOR_KEYWORDS.find(c => possibleColor.includes(c))!
              color = matched.charAt(0).toUpperCase() + matched.slice(1)
            }
            break
          }
        }
      }
    }

    // Check color from tokens if not found yet
    if (!color) {
      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i].trim()
        if (!t || (size && t.toUpperCase() === size.toUpperCase())) continue
        const lower = t.toLowerCase()

        // Exact match
        const matched = COLOR_KEYWORDS.find(c => lower === c)
        if (matched) {
          color = t.charAt(0).toUpperCase() + t.slice(1)
          // Look for preceding compound color (e.g. Braun-Lila, Schwarz-Gruen)
          if (i > 0) {
            const prevToken = tokens[i - 1].trim()
            const prevMatched = COLOR_KEYWORDS.find(c => prevToken.toLowerCase() === c)
            if (prevMatched) {
              color = `${prevToken.charAt(0).toUpperCase() + prevToken.slice(1)}-${color}`
            }
          }
          break
        }

        // Concatenated compound color like "BlauOrange"
        for (const c1 of COLOR_KEYWORDS) {
          if (lower.startsWith(c1) && lower.length > c1.length) {
            const rest = lower.slice(c1.length)
            const c2 = COLOR_KEYWORDS.find(c => c === rest)
            if (c2) {
              color = t
              break
            }
          }
        }
        if (color) break
      }
    }
  }

  // 3. Fallback to title for color if still missing
  if (!color && title) {
    const inColorMatch = title.match(/\bin\s+([A-ZÄÖÜ][a-zäöü]+(?:\s*-\s*[A-ZÄÖÜ][a-zäöü]+)?)/i)
    if (inColorMatch) {
      const candidate = inColorMatch[1].trim().toLowerCase()
      const matched = COLOR_KEYWORDS.find(c => candidate.includes(c))
      if (matched) {
        color = inColorMatch[1].trim()
      }
    }
    if (!color) {
      const titleWords = title.split(/\s+/)
      for (const w of titleWords) {
        const clean = w.replace(/[^a-zA-ZäöüÄÖÜß]/g, '').toLowerCase()
        const matched = COLOR_KEYWORDS.find(c => clean === c)
        if (matched) {
          color = clean.charAt(0).toUpperCase() + clean.slice(1)
          break
        }
      }
    }
  }

  return { color, size }
}
