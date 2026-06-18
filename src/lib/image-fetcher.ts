import 'server-only'

// Simple in-memory cache to avoid fetching the same image multiple times per cold start
const imageCache = new Map<string, string>()

/**
 * Fetches an image URL and converts it to a Base64 data URI.
 * This is crucial for @react-pdf/renderer to avoid Vercel's internal loop protection
 * and bot protection (429 Too Many Requests), which blocks serverless functions
 * from fetching URLs on their own domain without a User-Agent.
 */
export async function fetchImageAsBase64(url?: string): Promise<string | undefined> {
  if (!url) return undefined
  if (url.startsWith('data:')) return url // Already base64

  if (imageCache.has(url)) {
    return imageCache.get(url)
  }

  try {
    // We add a realistic User-Agent to bypass Vercel Edge Firewall bot protection
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TheOmniStack/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      // Increase timeout just in case
      signal: AbortSignal.timeout(5000)
    })

    if (!res.ok) {
      console.warn(`[fetchImageAsBase64] Failed to fetch image ${url}: ${res.status} ${res.statusText}`)
      return undefined
    }

    const buffer = await res.arrayBuffer()
    const mimeType = res.headers.get('content-type') || 'image/png'
    const base64 = `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`
    
    // Cache the result to save bandwidth and prevent rate limits on subsequent PDFs
    imageCache.set(url, base64)
    return base64
  } catch (err) {
    console.warn(`[fetchImageAsBase64] Error fetching image ${url}:`, err)
    return undefined
  }
}
