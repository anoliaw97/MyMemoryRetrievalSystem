import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MyMemory – AI Memory Retrieval System',
  description:
    'Save anything – images, text, links – and ask questions about your memories. Powered by Groq AI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
