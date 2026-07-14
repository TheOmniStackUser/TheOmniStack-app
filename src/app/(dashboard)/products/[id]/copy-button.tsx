'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function InlineCopyButton({ text, label, className = '' }: { text: string, label: string, className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!text) return null;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all focus:opacity-100 ${className}`}
      title={`${label} kopieren`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}
