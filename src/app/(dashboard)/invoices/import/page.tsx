import { Metadata } from 'next'
import { InvoiceUpload } from '@/components/ui/invoice-upload'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'E-Rechnung Importieren | TheOmniStack',
  description: 'ZUGFeRD oder XRechnung Dateien einlesen und importieren.',
}

export default function InvoiceImportPage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link 
          href="/invoices" 
          className="p-2 -ml-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Beleg einlesen</h1>
          <p className="text-slate-500 font-medium mt-1">E-Rechnung (ZUGFeRD / XRechnung) hochladen</p>
        </div>
      </div>

      <InvoiceUpload />
    </div>
  )
}
