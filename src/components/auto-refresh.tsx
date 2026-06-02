'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function AutoRefresh() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // This creates a "stale-while-revalidate" pattern for Server Components.
    // When the pathname changes (e.g., navigating to a different tab),
    // we wait a brief moment to let the instant cached render complete,
    // then trigger a background refresh to fetch fresh data from the server.
    const timer = setTimeout(() => {
      router.refresh()
    }, 500) // 500ms allows the UI to settle before refreshing

    // We also refresh when the user switches tabs and comes back to the app
    const onFocus = () => {
      router.refresh()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [pathname, router])

  return null
}
