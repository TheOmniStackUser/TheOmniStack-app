'use client'

import { useState } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { AlertModal } from '@/components/alert-modal'
import { useFormStatus } from 'react-dom'

export function ProductFormClient({ action, children }: { action: (formData: FormData) => Promise<void>, children: React.ReactNode }) {
  const [showAlert, setShowAlert] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    try {
      await action(formData)
      setShowAlert(true)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <>
      <form action={handleSubmit} className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
        {children}
      </form>
      <AlertModal isOpen={showAlert} onClose={() => setShowAlert(false)} title="Erfolgreich gespeichert" message="Die Produktdaten wurden erfolgreich aktualisiert." />
    </>
  )
}

export function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-400 hover:to-blue-400 shadow-md transition-all duration-300 disabled:opacity-50">
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {pending ? 'Speichert...' : 'Speichern'}
    </button>
  )
}
