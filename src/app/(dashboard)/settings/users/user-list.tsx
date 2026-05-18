'use client'

import { useState } from 'react'
import { addUserAction, removeUserAction } from '@/app/actions/users'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

interface Member {
  id: string
  name: string
  email: string
  role: string
  joinedAt: Date
}

export function UserList({ 
  initialMembers, 
  currentUserRole,
  currentUserId 
}: { 
  initialMembers: Member[]
  currentUserRole: string
  currentUserId: string
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const result = await addUserAction(formData)

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setIsAdding(false)
      setIsSubmitting(false)
    }
  }

  const handleRemoveUser = async (userId: string) => {
    if (!confirm('Bist du sicher, dass du diesen Benutzer entfernen möchtest?')) return

    const result = await removeUserAction(userId)
    if (result?.error) {
      alert(result.error)
    }
  }

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin'
  const isLimitReached = initialMembers.length >= 10

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-50 px-4 py-3 rounded-xl border border-slate-200">
        <div className="text-sm font-medium text-slate-600">
          Benutzerlimit: <span className={isLimitReached ? 'text-red-600 font-bold' : 'text-slate-900 font-bold'}>{initialMembers.length} / 10</span>
        </div>
        {canManage && (
          <button
            onClick={() => setIsAdding(!isAdding)}
            disabled={isLimitReached && !isAdding}
            className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Benutzer hinzufügen
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Neuen Benutzer anlegen</h3>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Name</label>
              <input name="name" required className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium placeholder:text-slate-400 text-slate-900 bg-white" placeholder="Max Mustermann" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">E-Mail</label>
              <input name="email" type="email" required className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium placeholder:text-slate-400 text-slate-900 bg-white" placeholder="max@beispiel.de" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Passwort (initial)</label>
              <input name="password" type="password" required className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium placeholder:text-slate-400 text-slate-900 bg-white" placeholder="********" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Rolle</label>
              <select name="role" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 bg-white">
                <option value="staff">Händler-Mitarbeiter (Operativ)</option>
                <option value="admin">Administrator (Vollzugriff)</option>
                {currentUserRole === 'owner' && (
                  <option value="omnistack_support">TheOmniStack Mitarbeiter (Support & Beta)</option>
                )}
              </select>
            </div>
            {error && <div className="md:col-span-2 text-sm text-red-600 font-bold">{error}</div>}
            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg transition-all">Abbrechen</button>
              <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50">
                {isSubmitting ? 'Wird erstellt...' : 'Benutzer anlegen'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Benutzer</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rolle</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Hinzugefügt am</th>
              <th className="px-6 py-4 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialMembers.map((member) => (
              <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{member.name} {member.id === currentUserId && '(Du)'}</div>
                      <div className="text-sm text-slate-500">{member.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    member.role === 'owner' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    member.role === 'admin' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    member.role === 'omnistack_support' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                    'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                    {member.role === 'owner' ? 'Besitzer' : 
                     member.role === 'admin' ? 'Administrator' : 
                     member.role === 'omnistack_support' ? 'Support' :
                     'Mitarbeiter'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {format(new Date(member.joinedAt), 'dd.MM.yyyy', { locale: de })}
                </td>
                <td className="px-6 py-4 text-right">
                  {canManage && member.id !== currentUserId && member.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveUser(member.id)}
                      className="p-2 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                      title="Benutzer entfernen"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
