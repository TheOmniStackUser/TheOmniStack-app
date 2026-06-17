'use client'

import React, { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { deleteMapping } from '@/app/actions/products'

export function DeleteMappingClient({ mappingId }: { mappingId: string }) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm('Möchten Sie dieses Mapping wirklich löschen?')) return
    setIsDeleting(true)
    try {
      await deleteMapping(mappingId)
      router.refresh()
    } catch (e) {
      console.error(e)
      alert('Fehler beim Löschen des Mappings.')
      setIsDeleting(false)
    }
  }

  return (
    <button 
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-rose-400 hover:text-rose-600 p-1 bg-rose-50 hover:bg-rose-100 rounded transition-colors disabled:opacity-50"
    >
      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  )
}
