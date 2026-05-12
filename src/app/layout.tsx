import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: {
    default: 'theomnistack — E-Commerce OS',
    template: '%s | theomnistack',
  },
  description:
    'Das zentrale Betriebssystem für E-Commerce-Unternehmen. Marktplatz-Sync, GoBD-konforme Rechnungen und Versandlabels aus einer Hand.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
