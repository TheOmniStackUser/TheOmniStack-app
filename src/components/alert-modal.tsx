import { ReactNode, useEffect, useState } from 'react'

interface AlertModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string | ReactNode
  confirmText?: string
}

export function AlertModal({ isOpen, onClose, title, message, confirmText = 'OK' }: AlertModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!mounted || !isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/50 dark:border-slate-800/50 w-full max-w-sm overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        <div className="p-6">
          {title && <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>}
          <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            {message}
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
