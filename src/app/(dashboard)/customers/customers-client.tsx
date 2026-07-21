'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { searchCustomersAction, saveCustomerAction } from '@/app/actions/customers'
import { WORLD_COUNTRIES } from '@/lib/countries'

export function CustomersClient({ initialCustomers }: { initialCustomers: any[] }) {
  const [customers, setCustomers] = useState(initialCustomers)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formData, setFormData] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setIsSearching(true)
      searchCustomersAction(searchQuery).then(res => {
        setCustomers(res)
        setIsSearching(false)
      })
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery])

  const handleOpenCreate = () => {
    setFormMode('create')
    setFormData({ name: '', email: '', customerNumber: '', street: '', zip: '', city: '', country: 'DE', vatId: '' })
    setShowModal(true)
  }

  const handleOpenEdit = (customer: any) => {
    setFormMode('edit')
    setFormData(customer)
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      await saveCustomerAction(formData)
      setShowModal(false)
      setNotification({ message: 'Kunde erfolgreich gespeichert', type: 'success' })
      setTimeout(() => setNotification(null), 3000)
      
      setIsSearching(true)
      const res = await searchCustomersAction(searchQuery)
      setCustomers(res)
      setIsSearching(false)
    } catch (error) {
      console.error('Failed to save customer', error)
      setNotification({ message: 'Fehler beim Speichern des Kunden', type: 'error' })
      setTimeout(() => setNotification(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {notification && (
        <div className={`p-4 rounded-xl font-bold text-sm ${notification.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {notification.message}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full lg:max-w-md">
          <input 
            className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm text-slate-900 font-medium placeholder:text-slate-500 transition-all"
            placeholder="Suchen nach Name, E-Mail..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          {isSearching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          )}
        </div>
        <button 
          onClick={handleOpenCreate}
          className="px-5 py-2 w-full lg:w-auto bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          Neuen Kunden anlegen
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Kundennr.</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Firma / Name</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Kontakt</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Adresse</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-black text-cyan-600 bg-cyan-50 px-2 py-1 rounded-md text-[10px] uppercase">{c.customerNumber || '---'}</span>
                  </td>
                  <td className="px-6 py-4">
                    {c.companyName && <div className="font-bold text-slate-900">{c.companyName}</div>}
                    <div className={c.companyName ? "text-slate-600 font-medium mt-1" : "font-bold text-slate-900"}>{c.name}</div>
                    {c.vatId && <div className="text-[10px] text-slate-500 font-medium uppercase mt-1">USt-Id: {c.vatId}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-600 font-medium">{c.email || '---'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-600 font-medium">{c.street}</div>
                    <div className="text-slate-500 text-xs">{c.zip} {c.city}</div>
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                    <Link 
                      href={`/quotes/new?customerId=${c.id}`}
                      className="px-3 py-2 text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors inline-flex items-center gap-1.5"
                      title="Angebot erstellen"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Angebot
                    </Link>
                    <Link 
                      href={`/invoices/new?customerId=${c.id}`}
                      className="px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors inline-flex items-center gap-1.5"
                      title="Rechnung erstellen"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Rechnung
                    </Link>
                    <button 
                      onClick={() => handleOpenEdit(c)}
                      className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors border border-transparent hover:border-cyan-100 inline-flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      Bearbeiten
                    </button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">
                    Keine Kunden gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isSaving && setShowModal(false)} />
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl relative z-[210] overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {formMode === 'create' ? 'Neuen Kunden anlegen' : 'Kunden bearbeiten'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Bitte füllen Sie die Kundendaten aus
                </p>
              </div>
              <button onClick={() => setShowModal(false)} disabled={isSaving} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600 disabled:opacity-50">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Firma</label>
                  <input className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-slate-900 placeholder:text-slate-500" value={formData?.companyName || ''} onChange={e => setFormData({ ...formData, companyName: e.target.value })} placeholder="Muster GmbH (Optional)" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Vor- und Nachname *</label>
                  <input required className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-slate-900 placeholder:text-slate-500" value={formData?.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Erika Mustermann" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">E-Mail</label>
                  <input type="email" className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-slate-900 placeholder:text-slate-500" value={formData?.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="erika@mustermann.de" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Kundennummer</label>
                  <input className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-slate-900 placeholder:text-slate-500" value={formData?.customerNumber || ''} onChange={e => setFormData({ ...formData, customerNumber: e.target.value })} placeholder="Leer = auto. Vergabe" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">USt-IdNr. (VAT ID)</label>
                  <input className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-slate-900 placeholder:text-slate-500" value={formData?.vatId || ''} onChange={e => setFormData({ ...formData, vatId: e.target.value.toUpperCase() })} placeholder="DE123456789" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Straße & Hausnummer *</label>
                  <input required className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-slate-900 placeholder:text-slate-500" value={formData?.street || ''} onChange={e => setFormData({ ...formData, street: e.target.value })} placeholder="Musterstraße 123" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PLZ *</label>
                  <input required className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-slate-900 placeholder:text-slate-500" value={formData?.zip || ''} onChange={e => setFormData({ ...formData, zip: e.target.value })} placeholder="12345" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Ort *</label>
                  <input required className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-bold text-slate-900 placeholder:text-slate-500" value={formData?.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="Musterstadt" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Land</label>
                  <select className="w-full px-4 py-3 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none bg-white" value={formData?.country || 'DE'} onChange={e => setFormData({ ...formData, country: e.target.value })}>
                    {WORLD_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-6 flex justify-end gap-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} disabled={isSaving} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50">Abbrechen</button>
                <button type="submit" disabled={isSaving} className="px-6 py-3 bg-cyan-500 text-white font-bold rounded-xl hover:bg-cyan-600 transition-all shadow-lg shadow-cyan-200 disabled:opacity-50 flex items-center gap-2">
                  {isSaving ? <span className="animate-spin">🌀</span> : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
