import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-dm',
})

export const metadata: Metadata = {
  title: 'CRM — V4 SCN & Co',
  description: 'CRM Comercial V4 SCN & Co',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={dmSans.className}>
        {children}
        <Script
          src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  )
}
