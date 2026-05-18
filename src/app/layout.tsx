import type { Metadata } from 'next'
import { Inter, Outfit } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' })

export const metadata: Metadata = {
  title: {
    default: 'TheOmniStack — E-Commerce OS',
    template: '%s | TheOmniStack',
  },
  description:
    'Das zentrale Betriebssystem für E-Commerce-Unternehmen. Marktplatz-Sync, GoBD-konforme Rechnungen und Versandlabels aus einer Hand.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL !== '' 
      ? process.env.NEXT_PUBLIC_APP_URL 
      : 'http://localhost:3000'
  ),
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' }
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${outfit.variable}`}>
      <body className="antialiased font-outfit">{children}</body>
    </html>
  )
}
