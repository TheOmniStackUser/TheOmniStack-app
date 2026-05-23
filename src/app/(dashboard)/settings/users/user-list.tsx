'use client'

import { useState } from 'react'
import { addUserAction, removeUserAction, getOrCreateInviteLinkAction, updateCurrentUserAction } from '@/app/actions/users'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

interface Member {
  id: string
  name: string
  email: string
  role: string
  joinedAt: Date
  isPending?: boolean
  inviteToken?: string | null
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
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  const [emailError, setEmailError] = useState<string | null>(null)

  const currentUser = initialMembers.find((m) => m.id === currentUserId)
  
  const [profileName, setProfileName] = useState(currentUser?.name || '')
  const [changePassword, setChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setProfileError(null)
    setProfileSuccess(false)
    setIsUpdatingProfile(true)

    const formData = new FormData(e.currentTarget)
    formData.append('changePassword', changePassword.toString())

    try {
      const result = await updateCurrentUserAction(formData)
      if (result?.error) {
        setProfileError(result.error)
      } else {
        setProfileSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setChangePassword(false)
      }
    } catch (err) {
      console.error(err)
      setProfileError('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setEmailError(null)
    setIsSubmitting(true)
    setGeneratedLink(null)

    const formData = new FormData(e.currentTarget)
    const result = await addUserAction(formData)

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setIsAdding(false)
      setIsSubmitting(false)
      if (result?.inviteLink) {
        setGeneratedLink(result.inviteLink)
      }
      if (result?.emailError) {
        setEmailError(result.emailError)
      }
    }
  }

  const [copyingInvite, setCopyingInvite] = useState<string | null>(null)
  const [copiedInviteEmail, setCopiedInviteEmail] = useState<string | null>(null)

  const handleCopyInviteLink = async (email: string) => {
    setCopyingInvite(email)
    try {
      const result = await getOrCreateInviteLinkAction(email)
      if (result?.inviteLink) {
        await navigator.clipboard.writeText(result.inviteLink)
        setCopiedInviteEmail(email)
        setTimeout(() => setCopiedInviteEmail(null), 2500)
      } else {
        alert('Fehler beim Abrufen des Einladungslinks.')
      }
    } catch (err) {
      console.error(err)
      alert('Fehler beim Abrufen des Einladungslinks.')
    } finally {
      setCopyingInvite(null)
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
      {/* Profil Section (Visible to everyone) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Mein Profil</h3>
            <p className="text-sm text-slate-500">Bearbeite deinen Namen und dein Passwort.</p>
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">E-Mail-Adresse</label>
              <input 
                type="email" 
                disabled 
                value={currentUser?.email || ''} 
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 font-medium outline-none cursor-not-allowed text-slate-900" 
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Die E-Mail-Adresse kann nicht geändert werden.</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Name</label>
              <input 
                name="name" 
                type="text" 
                required 
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 bg-white" 
                placeholder="Dein Name" 
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={changePassword} 
                onChange={(e) => setChangePassword(e.target.checked)} 
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-sm font-bold text-slate-700">Passwort ändern</span>
            </label>
          </div>

          {changePassword && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 animate-in fade-in duration-200">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Aktuelles Passwort</label>
                <input 
                  name="currentPassword" 
                  type="password" 
                  required={changePassword}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 bg-white" 
                  placeholder="••••••••" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Neues Passwort</label>
                <input 
                  name="newPassword" 
                  type="password" 
                  required={changePassword}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 bg-white" 
                  placeholder="••••••••" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Passwort bestätigen</label>
                <input 
                  name="confirmPassword" 
                  type="password" 
                  required={changePassword}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 bg-white" 
                  placeholder="••••••••" 
                />
              </div>
            </div>
          )}

          {profileError && (
            <div className="text-sm text-red-600 font-bold bg-red-50 px-4 py-2.5 rounded-xl border border-red-200 animate-in fade-in duration-200">
              {profileError}
            </div>
          )}

          {profileSuccess && (
            <div className="text-sm text-emerald-700 font-bold bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-200 animate-in fade-in duration-200">
              Profil erfolgreich aktualisiert!
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button 
              type="submit" 
              disabled={isUpdatingProfile} 
              className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 hover:shadow-blue-500/20 shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {isUpdatingProfile ? 'Speichern...' : 'Profil speichern'}
            </button>
          </div>
        </form>
      </div>

      {/* Team Management Section (Only visible to owner/admin) */}
      {canManage && (
        <>
          <div className="flex justify-between items-center bg-slate-50 px-4 py-3 rounded-xl border border-slate-200">
            <div className="text-sm font-medium text-slate-600">
              Benutzerlimit: <span className={isLimitReached ? 'text-red-600 font-bold' : 'text-slate-900 font-bold'}>{initialMembers.length} / 10</span>
            </div>
            <button
              onClick={() => setIsAdding(!isAdding)}
              disabled={isLimitReached && !isAdding}
              className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 disabled:grayscale cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Benutzer hinzufügen
            </button>
          </div>

          {generatedLink && (
            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-200 shadow-sm text-emerald-900 animate-in fade-in slide-in-from-top-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shadow-md shrink-0">
                  ✓
                </div>
                <div>
                  <h3 className="text-lg font-bold">Benutzer erfolgreich angelegt!</h3>
                  {emailError ? (
                    <div className="mt-1 text-sm text-amber-800 font-medium">
                      ⚠️ Der Benutzer wurde angelegt, aber die E-Mail konnte nicht gesendet werden.
                      <span className="block text-xs mt-1 text-amber-700 font-mono bg-amber-100/60 px-1.5 py-0.5 rounded w-fit border border-amber-200">
                        Fehler von Resend: {emailError}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-emerald-700">Der Benutzer wurde eingeladen und hat eine E-Mail erhalten.</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Einladungslink (zur manuellen Übergabe):</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedLink}
                    className="flex-1 px-4 py-2 border border-emerald-200 bg-white rounded-lg font-mono text-xs text-slate-800 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLink)
                      setCopiedLink(true)
                      setTimeout(() => setCopiedLink(false), 2000)
                    }}
                    className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-all text-sm shrink-0 cursor-pointer"
                  >
                    {copiedLink ? 'Kopiert!' : 'Link kopieren'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGeneratedLink(null)}
                    className="px-4 py-2 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-emerald-700 transition-all text-sm shrink-0 cursor-pointer"
                  >
                    Schließen
                  </button>
                </div>
              </div>
            </div>
          )}

          {isAdding && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl animate-in fade-in slide-in-from-top-4">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Neuen Benutzer anlegen</h3>
              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Name</label>
                  <input name="name" required className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium placeholder:text-slate-400 text-slate-900 bg-white" placeholder="Max Mustermann" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">E-Mail</label>
                  <input name="email" type="email" required className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium placeholder:text-slate-400 text-slate-900 bg-white" placeholder="max@beispiel.de" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Rolle</label>
                  <select name="role" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 bg-white cursor-pointer">
                    <option value="staff">Händler-Mitarbeiter (Operativ)</option>
                    <option value="admin">Administrator (Vollzugriff)</option>
                    {currentUserRole === 'owner' && (
                      <>
                        <option value="omnistack_support">TheOmniStack Mitarbeiter Vollzugriff (mit Admin Panel)</option>
                        <option value="omnistack_beta">TheOmniStack Mitarbeiter (mit Beta-Diensten)</option>
                      </>
                    )}
                  </select>
                </div>
                {error && <div className="md:col-span-3 text-sm text-red-600 font-bold">{error}</div>}
                <div className="md:col-span-3 flex justify-end gap-3 mt-2">
                  <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg transition-all cursor-pointer">Abbrechen</button>
                  <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50 cursor-pointer">
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
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          member.role === 'owner' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          member.role === 'admin' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          member.role === 'omnistack_support' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          member.role === 'omnistack_beta' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                          'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {member.role === 'owner' ? 'Besitzer' : 
                           member.role === 'admin' ? 'Administrator' : 
                           member.role === 'omnistack_support' ? 'TheOmniStack Support (Vollzugriff)' :
                           member.role === 'omnistack_beta' ? 'TheOmniStack Mitarbeiter' :
                           'Mitarbeiter'}
                        </span>
                        {member.isPending && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border bg-yellow-50 text-yellow-700 border-yellow-200">
                            Ausstehend
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {format(new Date(member.joinedAt), 'dd.MM.yyyy', { locale: de })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {member.isPending && canManage && member.id !== currentUserId && (
                          <button
                            onClick={() => handleCopyInviteLink(member.email)}
                            disabled={copyingInvite === member.email}
                            className="px-3 py-1 text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                            title="Einladungslink kopieren"
                          >
                            {copiedInviteEmail === member.email ? (
                              <>
                                <svg className="w-3.5 h-3.5 text-green-600 animate-in zoom-in-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Kopiert!</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                <span>{copyingInvite === member.email ? 'Lädt...' : 'Link kopieren'}</span>
                              </>
                            )}
                          </button>
                        )}
                        {canManage && member.id !== currentUserId && member.role !== 'owner' && (
                          <button
                            onClick={() => handleRemoveUser(member.id)}
                            className="p-2 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 cursor-pointer"
                            title="Benutzer entfernen"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
