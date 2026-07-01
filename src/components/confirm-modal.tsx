import { ReactNode, useEffect, useState } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string | ReactNode
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
}

export function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  title, 
  message, 
  confirmText = 'Bestätigen',
  cancelText = 'Abbrechen',
  isDestructive = false
}: ConfirmModalProps) {
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
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={`px-4 py-2 text-white text-sm font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              isDestructive 
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' 
                : 'bg-[#95BF47] hover:bg-[#85ab3f] focus:ring-[#95BF47]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
