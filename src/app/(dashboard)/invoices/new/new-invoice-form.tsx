'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createManualInvoiceAction, editManualInvoiceAction, previewInvoiceAction, getDraftsAction, getDraftDetailsAction, deleteDraftAction } from '@/app/actions/manual-invoice'
import { getInvoiceSettingsAction, saveInvoiceTemplateAction } from '@/app/actions/invoice-settings'
import { searchCustomersAction, validateVatAction } from '@/app/actions/customers'
import { WORLD_COUNTRIES, EU_COUNTRIES } from '@/lib/countries'

export function NewInvoiceForm({ documentType = 'invoice' }: { documentType?: 'invoice' | 'quote' | 'delivery_note' }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  const [draftName, setDraftName] = useState('')
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<any[]>([])
  const [showDraftsList, setShowDraftsList] = useState(false)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [customText, setCustomText] = useState('')
  const [templates, setTemplates] = useState<{ id: string, name: string, content: string }[]>([])
  const [defaults, setDefaults] = useState({ de: '', en: '' })
  const [hasVatId, setHasVatId] = useState(false)
  const [internalNote, setInternalNote] = useState('')
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null)
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')

  const [customer, setCustomer] = useState({
    id: undefined as string | undefined,
    name: '',
    street: '',
    zip: '',
    city: '',
    country: 'DE',
    email: '',
    vatId: '',
    customerNumber: ''
  })

  const [settings, setSettings] = useState({
    isCreditNote: false,
    currency: 'EUR',
    dueDateDays: 14,
    discount: 0,
    skontoPercent: 0,
    skontoDays: 7,
    shippingCountry: 'DE',
    destinationCountry: 'DE',
    taxCountry: 'DE',
    orderNumber: '',
    orderDate: '',
    buyerReference: '',
    externalId: '',
    isOss: false,
    taxOption: 'standard',
    createOrder: false
  })

  const getAvailableVatRates = () => {
    const rates = new Set([0])
    const isTaxExempt = ['kleinunternehmer', 'drittland', 'eu_vat_id', 'reverse_charge', 'innergemeinschaftlich', 'ausfuhr', 'sonstige', 'innenumsatz'].includes(settings.taxOption)
    if (isTaxExempt) return [0]
    
    const allEqual = settings.taxCountry === settings.shippingCountry && settings.shippingCountry === settings.destinationCountry
    const targetCountryCode = allEqual ? settings.taxCountry : (settings.isOss ? settings.destinationCountry : 'DE')
    
    const countryData = EU_COUNTRIES.find(c => c.code === targetCountryCode)
    if (countryData) {
      rates.add(countryData.standardRate)
      rates.add(countryData.reducedRate)
    } else if (targetCountryCode === 'DE') {
      rates.add(19)
      rates.add(7)
    }
    return Array.from(rates).sort((a, b) => b - a)
  }

  const availableVatRates = useMemo(() => getAvailableVatRates(), [
    settings.isOss,
    settings.destinationCountry,
    settings.taxOption,
    settings.taxCountry,
    settings.shippingCountry
  ])
  const standardRate = availableVatRates[0] || 19

  const [items, setItems] = useState([{ sku: '', title: '', quantity: 1, unitPrice: 0, taxRate: standardRate }])

  const [formats, setFormats] = useState({
    standardPdf: true,
    standardPdfNoLetterhead: false,
    zugferdEn16931: false,
    zugferdExtended: false,
    xrechnung: false
  })
  const [customerResults, setCustomerResults] = useState<any[]>([])
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false)
  const [vatCheckStatus, setVatCheckStatus] = useState<{ 
    status: 'idle' | 'checking' | 'valid' | 'invalid' | 'uncertain', 
    lastChecked?: Date,
    name?: string,
    address?: string,
    requestIdentifier?: string,
    ownVatId?: string,
    provider?: 'VIES' | 'EVATR',
    message?: string
  }>({ status: 'idle' })
  const [vatValidationHistory, setVatValidationHistory] = useState<any[]>([])
  const [activeVatProvider, setActiveVatProvider] = useState<'NONE' | 'VIES' | 'EVATR'>('NONE')
  const [ownVatId, setOwnVatId] = useState('')

  useEffect(() => {
    if (editId) {
      handleLoadDraft(editId)
    }
  }, [editId])
  const [companyVatId, setCompanyVatId] = useState('')
  const [showVatModal, setShowVatModal] = useState(false)

  const loadDraftsList = async () => {
    const data = await getDraftsAction()
    setDrafts(data)
  }

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await getInvoiceSettingsAction()
        setTemplates(data.templates)
        setDefaults(data.defaults)
        setHasVatId(data.hasVatId)
        setCompanyVatId(data.vatId)
        setOwnVatId(data.vatId)
        await loadDraftsList()
      } catch (error) {
        console.error('Failed to load settings', error)
      } finally {
        setIsLoadingSettings(false)
      }
    }
    loadSettings()
  }, [])

  const draftIdParam = searchParams.get('draftId')

  useEffect(() => {
    if (draftIdParam) {
      handleLoadDraft(draftIdParam)
    }
  }, [draftIdParam])

  const handleLoadDraft = async (draftId: string) => {
    try {
      const { invoice, items: draftItems } = await getDraftDetailsAction(draftId)
      setCurrentDraftId(draftId)
      setCustomer({
        id: undefined,
        name: invoice.recipientName || '',
        street: invoice.recipientStreet || '',
        zip: invoice.recipientZip || '',
        city: invoice.recipientCity || '',
        country: invoice.recipientCountry || 'DE',
        email: invoice.recipientEmail || '',
        vatId: '',
        customerNumber: (invoice as any).customerNumber || ''
      })
      setItems(draftItems.map(i => ({
        sku: i.sku || '',
        title: i.description,
        quantity: parseFloat(i.quantity),
        unitPrice: parseFloat(i.unitPrice),
        taxRate: parseFloat(i.taxRate) * 100
      })))
      setDraftName(invoice.draftName || '')
      setSettings({
        isCreditNote: invoice.isCreditNote || false,
        currency: invoice.currency || 'EUR',
        dueDateDays: (invoice as any).dueDateDays || 14,
        discount: (invoice as any).discountRate || 0,
        skontoPercent: (invoice as any).skontoRate || 0,
        skontoDays: (invoice as any).skontoDays || 7,
        shippingCountry: (invoice as any).shippingCountry || 'DE',
        destinationCountry: (invoice as any).destinationCountry || 'DE',
        taxCountry: (invoice as any).taxCountry || 'DE',
        orderNumber: (invoice as any).orderNumber || '',
        orderDate: (invoice as any).orderDate || '',
        buyerReference: (invoice as any).buyerReference || '',
        externalId: (invoice as any).externalId || '',
        taxOption: (invoice as any).taxOption || 'standard',
        isOss: (invoice as any).ossEnabled || false,
        createOrder: (invoice as any).createOrder || false,
      })
      setCustomText(invoice.customText || '')
      setShowDraftsList(false)
      setNotification({ message: 'Entwurf geladen!', type: 'success' })
      setTimeout(() => setNotification(null), 5000)
    } catch (error) {
      setNotification({ message: 'Fehler beim Laden des Entwurfs', type: 'error' })
    }
  }

  const handleDeleteDraft = async (e: React.MouseEvent, draftId: string) => {
    e.stopPropagation()
    if (!confirm('Diesen Entwurf wirklich löschen?')) return
    try {
      await deleteDraftAction(draftId)
      await loadDraftsList()
      setNotification({ message: 'Entwurf gelöscht', type: 'success' })
      setTimeout(() => setNotification(null), 3000)
    } catch (error) {
      setNotification({ message: 'Fehler beim Löschen des Entwurfs', type: 'error' })
    }
  }

  const handleSaveTemplate = async () => {
    if (!customText) return
    const name = prompt('Name für diese Vorlage:')
    if (!name) return
    try {
      const newTemplate = await saveInvoiceTemplateAction(name, customText)
      setTemplates([...templates, newTemplate])
      setNotification({ message: 'Vorlage gespeichert!', type: 'success' })
      setTimeout(() => setNotification(null), 5000)
    } catch (error) {
      setNotification({ message: 'Fehler beim Speichern der Vorlage', type: 'error' })
    }
  }
  const handleSearchCustomers = async (q: string) => {
    setCustomer({ ...customer, name: q })
    if (q.length < 2) {
      setCustomerResults([])
      return
    }
    setIsSearchingCustomers(true)
    try {
      const results = await searchCustomersAction(q)
      setCustomerResults(results)
    } catch (error) {
      console.error('Customer search failed', error)
    } finally {
      setIsSearchingCustomers(false)
    }
  }

  const selectCustomer = (c: any) => {
    setCustomer({
      id: c.id,
      name: c.name,
      street: c.street || '',
      zip: c.zip || '',
      city: c.city || '',
      country: c.country || 'DE',
      email: c.email || '',
      vatId: c.vatId || '',
      customerNumber: c.customerNumber || ''
    })
    setSettings(prev => ({ ...prev, destinationCountry: c.country || 'DE' }))
    setVatCheckStatus({ 
      status: c.vatCheckResult === 'VALID' ? 'valid' : (c.vatCheckResult === 'INVALID' ? 'invalid' : 'idle'),
      lastChecked: c.lastVatCheckAt
    })
    setCustomerResults([])
    setShowCustomerSearch(false)
  }

  const handleValidateVat = async (provider: 'VIES' | 'EVATR' = 'VIES') => {
    if (!customer.vatId) return
    setVatCheckStatus({ ...vatCheckStatus, status: 'checking' })
    try {
      const result = await validateVatAction(customer.vatId, customer.id, provider, ownVatId)
      if (result.success) {
        const newStatus = {
          status: result.isServiceUnavailable ? 'uncertain' : (result.isValid ? 'valid' : 'invalid') as any,
          lastChecked: result.checkedAt,
          name: result.name,
          address: result.address,
          requestIdentifier: result.requestIdentifier,
          ownVatId: ownVatId,
          provider: provider,
          message: result.message
        }
        setVatCheckStatus(newStatus)
        setVatValidationHistory([newStatus, ...vatValidationHistory])
        
        if (result.isValid) {
          const vName = result.name?.trim() || ''
          const vAddr = result.address?.trim() || ''
          
          if (vName && vName !== '---') {
            const isNameDifferent = vName.toLowerCase() !== customer.name.toLowerCase().trim()
            
            if (isNameDifferent) {
              // Instead of confirm, we just log or we could show a "Sync" button in the modal later
              console.log('VAT name mismatch:', vName)
            }
          }
        }
      } else {
        setVatCheckStatus({ status: 'idle' })
      }
    } catch (error: any) {
      console.error('VAT Check Exception:', error)
      setVatCheckStatus({ status: 'idle' })
    }
  }

  const addItem = () => setItems([...items, { sku: '', title: '', quantity: 1, unitPrice: 0, taxRate: standardRate }])
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index))

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    // @ts-ignore
    newItems[index][field] = value
    setItems(newItems)
  }

  const handleSubmit = async (e: React.FormEvent, status: 'issued' | 'draft' = 'issued') => {
    if (e) e.preventDefault()

    if (status === 'issued') setIsSubmitting(true)
    else setIsSavingDraft(true)

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + settings.dueDateDays)

    // Validation
    if (!customer.name.trim()) {
      setNotification({ message: 'Bitte geben Sie einen Kundennamen ein.', type: 'error' })
      if (status === 'issued') setIsSubmitting(false)
      else setIsSavingDraft(false)
      return
    }

    const validItems = items.filter(item => item.title.trim() !== '')
    if (validItems.length === 0) {
      setNotification({ message: 'Bitte mindestens eine Position mit Titel eingeben.', type: 'error' })
      if (status === 'issued') setIsSubmitting(false)
      else setIsSavingDraft(false)
      return
    }

    try {
      if (editId) {
        if (!internalNote.trim()) {
          setNotification({ message: 'Bitte gib einen internen Vermerk für die Bearbeitung an.', type: 'error' })
          setIsSubmitting(false)
          setIsSavingDraft(false)
          return
        }
        
        const result = await editManualInvoiceAction({
          invoiceId: editId,
          internalNote,
          customer,
          items: validItems,
          currency: settings.currency,
          isCreditNote: settings.isCreditNote,
          taxOption: settings.taxOption,
          dueDate,
          shippingCountry: settings.shippingCountry,
          destinationCountry: settings.destinationCountry,
          taxCountry: settings.taxCountry,
          orderNumber: settings.orderNumber,
          orderDate: settings.orderDate ? new Date(settings.orderDate) : undefined,
          buyerReference: settings.buyerReference,
          externalId: settings.externalId,
          customText,
          skontoRate: settings.skontoPercent,
          skontoDays: settings.skontoDays,
          discountRate: settings.discount,
          ossEnabled: settings.isOss,
          dueDateDays: settings.dueDateDays,
          vatCheckStatus
        })
        
        if (result?.error) {
          setNotification({ message: `Fehler: ${result.error}`, type: 'error' })
          setIsSubmitting(false)
          setIsSavingDraft(false)
          return
        }

        setNotification({ message: 'Rechnung wurde erfolgreich aktualisiert!', type: 'success' })
        setTimeout(() => {
          location.href = '/invoices'
        }, 1500)
        return
      }

      const result = await createManualInvoiceAction({
        customer,
        items: validItems,
        currency: settings.currency,
        isCreditNote: settings.isCreditNote,
        customText,
        taxOption: settings.taxOption,
        dueDate,
        status,
        draftName,
        shippingCountry: settings.shippingCountry,
        destinationCountry: settings.destinationCountry,
        taxCountry: settings.taxCountry,
        orderNumber: settings.orderNumber,
        orderDate: settings.orderDate ? new Date(settings.orderDate) : undefined,
        buyerReference: settings.buyerReference,
        externalId: settings.externalId,
        skontoRate: settings.skontoPercent,
        skontoDays: settings.skontoDays,
        discountRate: settings.discount,
        ossEnabled: settings.isOss,
        dueDateDays: settings.dueDateDays,
        createOrder: settings.createOrder,
        currentDraftId,
        vatCheckStatus,
        documentType,
      })

      if (result?.error) {
        setNotification({ message: `Fehler: ${result.error}`, type: 'error' })
      } else {
        if (status === 'draft') {
          if (result.draftId) {
            setCurrentDraftId(result.draftId)
          }
          setNotification({ message: 'Entwurf gespeichert!', type: 'success' })
          setTimeout(() => setNotification(null), 5000)
          await loadDraftsList()
        }
      }
      setIsSubmitting(false)
      setIsSavingDraft(false)
    } catch (error: any) {
      if (error.message === 'NEXT_REDIRECT' || error.digest?.includes('NEXT_REDIRECT')) {
        return
      }
      setNotification({ 
        message: status === 'issued' ? 'Fehler beim Erstellen der Rechnung' : 'Fehler beim Speichern des Entwurfs', 
        type: 'error' 
      })
      setIsSubmitting(false)
      setIsSavingDraft(false)
    }
  }

  const handlePreview = async () => {
    setIsPreviewing(true)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + settings.dueDateDays)

    try {
      const result = await previewInvoiceAction({
        customer,
        items,
        currency: settings.currency,
        isCreditNote: settings.isCreditNote,
        customText,
        taxOption: settings.taxOption,
        dueDate,
        orderNumber: settings.orderNumber,
        orderDate: settings.orderDate ? new Date(settings.orderDate) : undefined,
        buyerReference: settings.buyerReference,
        externalId: settings.externalId,
        documentType
      })

      if (result.base64) {
        const byteCharacters = atob(result.base64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
      }
    } catch (error) {
      console.error(error)
      setNotification({ message: 'Fehler beim Generieren der Vorschau', type: 'error' })
    } finally {
      setIsPreviewing(false)
    }
  }

  // Sync item tax rates if country changes or tax option changes
  useEffect(() => {
    setItems(currentItems => {
      const validRates = new Set(availableVatRates)
      const standardRate = availableVatRates[0] || 0
      const isTaxExempt = ['kleinunternehmer', 'drittland', 'eu_vat_id', 'reverse_charge', 'innergemeinschaftlich', 'ausfuhr', 'sonstige', 'innenumsatz'].includes(settings.taxOption)

      let changed = false
      const nextItems = currentItems.map(item => {
        // If tax option forces 0%, apply it
        const targetRate = isTaxExempt ? 0 : (validRates.has(item.taxRate) ? item.taxRate : standardRate)
        if (item.taxRate !== targetRate) {
          changed = true
          return { ...item, taxRate: targetRate }
        }
        return item
      })

      return changed ? nextItems : currentItems
    })
  }, [availableVatRates, settings.taxOption])

  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0)
  const discountAmount = subtotal * (settings.discount / 100)
  const netAfterDiscount = subtotal - discountAmount
  const totalTax = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice * (1 - settings.discount / 100) * (i.taxRate / 100)), 0)
  const total = netAfterDiscount + totalTax

  return (
    <>
    {/* Modern Notification Toast */}
    {notification && (
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
        <div className={`px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-4 min-w-[320px] ${
          notification.type === 'success' ? 'bg-white border-green-100 text-green-800' : 
          notification.type === 'error' ? 'bg-white border-red-100 text-red-800' : 
          'bg-white border-blue-100 text-blue-800'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            notification.type === 'success' ? 'bg-green-50 text-green-600' : 
            notification.type === 'error' ? 'bg-red-50 text-red-600' : 
            'bg-blue-50 text-blue-600'
          }`}>
            {notification.type === 'success' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>}
            {notification.type === 'error' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>}
            {notification.type === 'info' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm leading-tight">{notification.message}</p>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-slate-50 rounded-lg transition-colors text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    )}

    <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-8 pb-32">
      {/* Top Header with Draft Loading */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {editId ? 'Rechnung bearbeiten' : 'Manuelle Erstellung'}
            </h1>
            <p className="text-sm text-slate-500">Erstellen Sie Rechnungen oder Gutschriften manuell</p>
          </div>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setShowDraftsList(!showDraftsList)} className="px-6 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2">📂 Entwurf laden ({drafts.length})</button>
          {showDraftsList && (
            <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                <span>Gespeicherte Entwürfe</span>
                <button onClick={() => setShowDraftsList(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {drafts.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 italic">Keine Entwürfe gefunden</div>
                ) : (
                  drafts.map(d => (
                    <div key={d.id} onClick={() => handleLoadDraft(d.id)} className="w-full p-4 text-left hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors group flex justify-between items-center cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 group-hover:text-blue-600 truncate">{d.draftName || 'Unbenannter Entwurf'}</div>
                        <div className="text-xs text-slate-500 flex gap-2 mt-1 truncate">
                          <span>{d.recipientName}</span>
                          <span>•</span>
                          <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        <div className="text-xs font-bold text-slate-400">{parseFloat(d.totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
                        <button onClick={(e) => handleDeleteDraft(e, d.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Löschen"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Info */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8">
        <div className="flex flex-wrap items-center gap-8 border-b border-slate-100 pb-6">
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dokumenttyp</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSettings({ ...settings, isCreditNote: false })} className={`px-6 py-2.5 rounded-xl border-2 transition-all font-bold ${!settings.isCreditNote ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>Rechnung</button>
              <button type="button" onClick={() => setSettings({ ...settings, isCreditNote: true })} className={`px-6 py-2.5 rounded-xl border-2 transition-all font-bold ${settings.isCreditNote ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>Gutschrift</button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Währung</label>
            <select className="px-4 py-2.5 border-2 border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500 bg-white" value={settings.currency} onChange={e => setSettings({ ...settings, currency: e.target.value })}>
              <option value="EUR">EUR (Euro)</option>
              <option value="USD">USD (US Dollar)</option>
              <option value="GBP">GBP (Britische Pfund)</option>
              <option value="CHF">CHF (Schweizer Franken)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Fälligkeit (Tage)</label>
            <input type="number" className="w-24 px-4 py-2.5 border-2 border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500" value={settings.dueDateDays} onChange={e => setSettings({ ...settings, dueDateDays: parseInt(e.target.value) })} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Skonto & Rabatt</h3><div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Skonto %</label><div className="relative"><input type="number" className="w-full pl-4 pr-8 py-2.5 border-2 border-slate-100 rounded-xl font-bold text-slate-900 focus:border-blue-400 outline-none" value={settings.skontoPercent} onChange={e => setSettings({ ...settings, skontoPercent: parseFloat(e.target.value) })} /><span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span></div></div><div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tage</label><input type="number" className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl font-bold text-slate-900 focus:border-blue-400 outline-none" value={settings.skontoDays} onChange={e => setSettings({ ...settings, skontoDays: parseInt(e.target.value) })} /></div><div className="col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rabatt auf Summe %</label><div className="relative"><input type="number" className="w-full pl-4 pr-8 py-2.5 border-2 border-slate-100 rounded-xl font-bold text-slate-900 focus:border-blue-400 outline-none" value={settings.discount} onChange={e => setSettings({ ...settings, discount: parseFloat(e.target.value) })} /><span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span></div></div></div></div>
          <div className="space-y-4 col-span-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Steuer-Optionen</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Umsatzsteueroption</label>
                <select 
                  className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl font-bold text-slate-900 focus:border-blue-400 outline-none bg-white" 
                  value={settings.taxOption} 
                  onChange={e => {
                    const newOption = e.target.value
                    setSettings({ 
                      ...settings, 
                      taxOption: newOption,
                      isOss: newOption === 'standard' ? settings.isOss : false
                    })
                  }}
                >
                  <option value="standard">Umsatzsteuerpflichtig</option>
                  <option value="kleinunternehmer" disabled={hasVatId}>Kleinunternehmen (Keine MwSt.) {hasVatId ? "(Deaktiviert)" : ""}</option>
                  <option value="drittland">Nicht steuerbar (Drittland)</option>
                  <option value="eu_vat_id">Nicht steuerbar (EU mit USt-IdNr.)</option>
                  <option value="eu_no_vat_id">Nicht steuerbar (EU ohne USt-IdNr.)</option>
                  <option value="reverse_charge">Steuerschuldwechsel §13b (Inland)</option>
                  <option value="innergemeinschaftlich">Innergemeinschaftliche Lieferung</option>
                  <option value="ausfuhr">Ausfuhrlieferung</option>
                  <option value="sonstige">sonstige Steuerbefreiung</option>
                  <option value="innenumsatz">Nicht steuerbarer Innenumsatz</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className={`flex items-center gap-3 ${settings.taxOption === 'standard' ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'} group`}>
                  <div className={`w-12 h-6 rounded-full transition-all relative ${settings.isOss ? 'bg-blue-600' : 'bg-slate-200'}`}>
                    <input 
                      type="checkbox" 
                      checked={settings.isOss} 
                      disabled={settings.taxOption !== 'standard'}
                      onChange={e => {
                        const active = e.target.checked
                        setSettings({ 
                          ...settings, 
                          isOss: active,
                          taxCountry: active ? settings.destinationCountry : settings.taxCountry
                        })
                      }} 
                      className="hidden" 
                    />
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.isOss ? 'left-7' : 'left-1'}`} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">OSS-Verfahren aktiv</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">Empfänger</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 relative">
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Name / Firma</label>
              <input 
                required 
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" 
                value={customer.name} 
                onChange={e => handleSearchCustomers(e.target.value)} 
                placeholder="Erika Mustermann" 
                autoComplete="off"
              />
              <button 
                type="button"
                onClick={async () => {
                  setSearchQuery(customer.name)
                  setShowCustomerSearch(true)
                  setIsSearchingCustomers(true)
                  const results = await searchCustomersAction(customer.name)
                  setCustomerResults(results)
                  setIsSearchingCustomers(false)
                }}
                className="absolute right-3 top-9 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="Kunden suchen"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
              {customerResults.length > 0 && !showCustomerSearch && (
                <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 z-[110] overflow-hidden">
                  {customerResults.map(c => (
                    <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="w-full p-4 text-left hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors flex justify-between items-center group">
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-blue-600">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.street}, {c.zip} {c.city}</div>
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.customerNumber || 'Bestandskunde'}</div>
                    </button>
                  ))}
                </div>
              )}
              {isSearchingCustomers && <div className="absolute right-4 top-10 animate-spin text-blue-500 text-sm">🌀</div>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">USt-IdNr. (VAT ID)</label>
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <input 
                    className={`w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 ${
                      vatCheckStatus.status === 'valid' ? 'border-green-500 bg-green-50' : 
                      (vatCheckStatus.status === 'invalid' ? 'border-red-500 bg-red-50' : 
                      (vatCheckStatus.status === 'uncertain' ? 'border-amber-400 bg-amber-50' : ''))
                    }`} 
                    value={customer.vatId} 
                    onChange={e => {
                      setCustomer({ ...customer, vatId: e.target.value.toUpperCase() })
                      setVatCheckStatus({ status: 'idle' })
                    }} 
                    placeholder="DE123456789" 
                  />
                  {vatCheckStatus.status === 'valid' && <span className="absolute right-4 top-3.5 text-green-600">✓</span>}
                  {vatCheckStatus.status === 'invalid' && <span className="absolute right-4 top-3.5 text-red-600">⚠</span>}
                  {vatCheckStatus.status === 'uncertain' && <span className="absolute right-4 top-3.5 text-amber-600">⌛</span>}
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowVatModal(true)}
                  className="px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm border border-slate-200"
                >
                  USt-IdNr. prüfen
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">E-Mail Adresse</label>
              <input 
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" 
                value={customer.email} 
                onChange={e => setCustomer({ ...customer, email: e.target.value })} 
                placeholder="erika@mustermann.de" 
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Kundennummer</label>
              <input 
                readOnly 
                className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-500 outline-none cursor-not-allowed" 
                value={customer.customerNumber || 'Wird automatisch vergeben'} 
                placeholder="K-10001" 
              />
            </div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-600 uppercase mb-2">Straße & Hausnummer</label><input required className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" value={customer.street} onChange={e => setCustomer({ ...customer, street: e.target.value })} placeholder="Musterstraße 123" /></div>
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-2">PLZ</label><input required className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" value={customer.zip} onChange={e => setCustomer({ ...customer, zip: e.target.value })} placeholder="12345" /></div>
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-2">Ort</label><input required className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" value={customer.city} onChange={e => setCustomer({ ...customer, city: e.target.value })} placeholder="Musterstadt" /></div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Land</label>
              <select className="w-full px-4 py-3 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none bg-white" value={customer.country} onChange={e => {
                const newCountry = e.target.value
                setCustomer({ ...customer, country: newCountry })
                setSettings({ ...settings, destinationCountry: newCountry })
              }}>
                {WORLD_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {vatValidationHistory.length > 0 && (
          <div className="lg:col-span-2 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Prüfungsergebnisse für USt-IdNr. <span className="bg-amber-50 px-2 rounded font-black">{customer.vatId}</span>
              </h3>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">USt-IdNr.</th>
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Zusatzinfo</th>
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Verknüpft mit</th>
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Geprüft am</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vatValidationHistory.map((v, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {v.status === 'valid' ? (
                            <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px]">✓</div>
                          ) : (
                            <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px]">!</div>
                          )}
                          <span className="font-bold text-slate-900">{customer.vatId}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-400 font-bold uppercase leading-tight">Abfrage-Nummer</p>
                          <p className="text-[10px] text-slate-500 font-medium italic">{v.requestIdentifier}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-600 uppercase">
                            {customer.name.substring(0, 2)}
                          </div>
                          <span className="font-bold text-slate-700">{customer.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-600">{new Date(v.lastChecked).toLocaleDateString('de-DE')} {new Date(v.lastChecked).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{v.provider === 'VIES' ? 'EU-Schnittstelle (VIES)' : 'Deutsche Schnittstelle (eVatR)'}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{v.ownVatId}</p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">Versand & Referenzen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Versandland</label>
              <select className="w-full px-4 py-3 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none bg-white" value={settings.shippingCountry} onChange={e => setSettings({ ...settings, shippingCountry: e.target.value })}>
                {WORLD_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Versandzielland</label>
              <select className="w-full px-4 py-3 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none bg-white" value={settings.destinationCountry} onChange={e => {
                const newCountry = e.target.value
                setSettings({ 
                  ...settings, 
                  destinationCountry: newCountry,
                  taxCountry: settings.isOss ? newCountry : settings.taxCountry
                })
                setCustomer({ ...customer, country: newCountry })
              }}>
                {WORLD_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-2">Steuerland</label><select className="w-full px-4 py-3 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none bg-white" value={settings.taxCountry} onChange={e => setSettings({ ...settings, taxCountry: e.target.value })}>{EU_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-2">Bestellnummer</label><input className="w-full px-4 py-3 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none" value={settings.orderNumber} onChange={e => setSettings({ ...settings, orderNumber: e.target.value })} placeholder="P000123" /></div>
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-2">Bestelldatum</label><input type="date" className={`w-full px-4 py-3 border border-slate-300 rounded-xl font-bold outline-none bg-white ${settings.orderDate ? 'text-slate-900' : 'text-slate-400'}`} value={settings.orderDate} onChange={e => setSettings({ ...settings, orderDate: e.target.value })} /></div>
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-2">Referenz des Käufers</label><input className="w-full px-4 py-3 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none" value={settings.buyerReference} onChange={e => setSettings({ ...settings, buyerReference: e.target.value })} placeholder="Ref-456" /></div>
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-2">Externe ID</label><input className="w-full px-4 py-3 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none" value={settings.externalId} onChange={e => setSettings({ ...settings, externalId: e.target.value })} placeholder="Ext-789" /></div>
          </div>
          
          {editId && (
            <div className="pt-6 border-t border-slate-100 mt-4">
              <label className="block text-xs font-black text-amber-600 uppercase mb-2 tracking-widest">Interner Vermerk (Warum wurde die Rechnung bearbeitet?)</label>
              <textarea 
                required
                className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl font-bold text-slate-900 outline-none bg-amber-50/30 focus:border-amber-400 focus:bg-amber-50/50 transition-all placeholder:text-amber-400/50"
                value={internalNote}
                onChange={e => setInternalNote(e.target.value)}
                placeholder="Beispiel: Tippfehler im Namen korrigiert, MwSt-Satz angepasst nach Rücksprache..."
                rows={3}
              />
              <p className="mt-2 text-[10px] text-amber-600/70 font-bold uppercase leading-tight">
                Dieser Vermerk dient nur der internen Dokumentation (GoBD) und wird NICHT auf der Rechnung angezeigt.
              </p>
            </div>
          )}
          
          <div className="pt-6 flex items-center gap-4 border-t border-slate-100 mt-4">
            <button 
              type="button"
              onClick={() => setSettings({ ...settings, createOrder: !settings.createOrder })}
              className={`w-14 h-7 rounded-full transition-all relative shadow-inner ${settings.createOrder ? 'bg-blue-600' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${settings.createOrder ? 'left-8' : 'left-1'}`} />
            </button>
            <div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Bestellung unter "Bestellungen" erzeugen?</p>
              <p className="text-[10px] text-slate-500 font-bold leading-tight mt-0.5">Standardmäßig deaktiviert. Falls aktiviert, erscheint diese manuelle Rechnung auch in der Bestellübersicht.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4"><h2 className="text-xl font-bold text-slate-900">Positionen</h2><button type="button" onClick={addItem} className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">+ Zeile hinzufügen</button></div>
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="flex flex-wrap md:flex-nowrap gap-4 items-start bg-slate-50/50 p-4 rounded-xl border border-slate-200">
              <div className="w-40 shrink-0">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Art.-Nr.</label>
                <input 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-sm" 
                  value={item.sku || ''} 
                  onChange={e => updateItem(index, 'sku', e.target.value)} 
                  placeholder="z.B. Art-100" 
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Bezeichnung</label>
                <input 
                  required 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-sm" 
                  value={item.title} 
                  onChange={e => updateItem(index, 'title', e.target.value)} 
                  placeholder="Produktbezeichnung..." 
                />
              </div>
              <div className="w-20"><label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Menge</label><input type="number" required min="1" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-sm" value={item.quantity} onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value))} /></div>
              <div className="w-32">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Einzelpreis (Netto)</label>
                <input type="number" step="0.01" required className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-sm" value={item.unitPrice} onChange={e => updateItem(index, 'unitPrice', parseFloat(e.target.value))} />
                <div className="mt-1 text-[10px] text-slate-400 font-bold">
                  Brutto: {(item.unitPrice * (1 + (item.taxRate / 100))).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
              </div>
              <div className="w-24">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">MwSt %</label>
                <select className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-sm" value={item.taxRate} onChange={e => updateItem(index, 'taxRate', parseFloat(e.target.value))}>
                  {availableVatRates.map(rate => <option key={rate} value={rate}>{rate}%</option>)}
                </select>
              </div>
              <div className="w-32 text-right">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Gesamt (Brutto)</label>
                <div className="px-3 py-2 bg-slate-100 rounded-lg font-bold text-slate-900 text-sm border border-slate-200">
                  {(item.quantity * item.unitPrice * (1 + (item.taxRate / 100))).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
                <div className="mt-1 text-[10px] text-slate-400 font-bold">
                  Netto: {(item.quantity * item.unitPrice).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
              </div>
              <div className="flex-shrink-0 mb-1"><button type="button" onClick={() => removeItem(index)} disabled={items.length === 1} className="p-2 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-6 border-t border-slate-100"><div className="w-80 space-y-3 bg-slate-50 p-6 rounded-2xl border border-slate-100"><div className="flex justify-between text-sm text-slate-500"><span>Zwischensumme:</span><span className="font-bold text-slate-900">{subtotal.toLocaleString('de-DE', { style: 'currency', currency: settings.currency })}</span></div>{settings.discount > 0 && <div className="flex justify-between text-sm text-blue-600"><span>Rabatt ({settings.discount}%):</span><span className="font-bold">-{discountAmount.toLocaleString('de-DE', { style: 'currency', currency: settings.currency })}</span></div>}<div className="flex justify-between text-sm text-slate-500"><span>MwSt:</span><span className="font-bold text-slate-900">{totalTax.toLocaleString('de-DE', { style: 'currency', currency: settings.currency })}</span></div><div className="flex justify-between text-xl font-bold text-slate-900 pt-3 border-t-2 border-slate-200"><span>Gesamt:</span><span>{total.toLocaleString('de-DE', { style: 'currency', currency: settings.currency })}</span></div></div></div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-900">Zusatztext / Notizen</h2>
          <div className="flex items-center gap-6">
            <div className="flex gap-2">
              <select className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none focus:border-blue-500 bg-slate-50" onChange={e => setCustomText(e.target.value)} defaultValue="">
                <option value="" disabled>Vorlage wählen...</option>
                <option value={defaults.de}>Standard (DE)</option>
                <option value={defaults.en}>Standard (EN)</option>
                {templates.map(t => <option key={t.id} value={t.content}>{t.name}</option>)}
              </select>
              <button type="button" onClick={handleSaveTemplate} className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-100 transition-all border border-blue-100">Als Vorlage speichern</button>
            </div>
          </div>
        </div>
        <textarea className="w-full h-32 px-4 py-3 border-2 border-slate-100 rounded-xl focus:border-blue-400 outline-none font-bold text-slate-800 placeholder:text-slate-300 leading-relaxed" value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Vielen Dank für Ihren Auftrag! Bitte begleichen Sie den offenen Betrag..." />
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3"><h2 className="text-xl font-bold text-slate-900">Formatauswahl</h2><span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full uppercase">E-Rechnung</span></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
          <div className="space-y-4"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Standard</h3><div className="space-y-3"><label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={formats.standardPdf} onChange={e => setFormats({ ...formats, standardPdf: e.target.checked })} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">Standard PDF</span></label><label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={formats.standardPdfNoLetterhead} onChange={e => setFormats({ ...formats, standardPdfNoLetterhead: e.target.checked })} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">Standard PDF ohne Briefpapier</span></label></div></div>
          <div className="space-y-4"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-Rechnung</h3><div className="space-y-3"><label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={formats.zugferdEn16931} onChange={e => setFormats({ ...formats, zugferdEn16931: e.target.checked })} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">ZUGFeRD 2.4 EN16931 PDF</span></label><label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={formats.zugferdExtended} onChange={e => setFormats({ ...formats, zugferdExtended: e.target.checked })} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><div className="flex items-center gap-2"><span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">ZUGFeRD 2.4 EXTENDED PDF</span><span className="text-[9px] font-bold text-slate-400 border border-slate-200 px-1 rounded uppercase">Beta</span></div></label><label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={formats.xrechnung} onChange={e => setFormats({ ...formats, xrechnung: e.target.checked })} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">XRechnung 3.0.2 XML</span></label></div></div>
        </div>
      </div>

      {/* Draft Naming moved to bottom */}
      {!editId && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entwurfs-Informationen</h2>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">Name für diesen Entwurf (optional)</label>
            <input className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900" value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="z.B. Testbestellung Soft Toast oder Nachlieferung Müller" />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-4 fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md p-6 border-t border-slate-200 z-50 px-10">
        <button type="button" onClick={() => window.history.back()} className="px-8 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Abbrechen</button>
        <button type="button" onClick={handlePreview} disabled={isPreviewing || isSubmitting || isSavingDraft} className="px-8 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50">{isPreviewing ? <span className="animate-spin">🌀</span> : 'Vorschau'}</button>
        {!editId && (
          <button type="button" onClick={(e) => handleSubmit(e, 'draft')} disabled={isSavingDraft || isSubmitting} className="px-8 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 disabled:opacity-50">{isSavingDraft ? 'Wird gespeichert...' : documentType === 'quote' ? 'Als Entwurf speichern' : 'Als Entwurf speichern'}</button>
        )}
        <button type="submit" disabled={isSubmitting || isSavingDraft} className={`px-10 py-3 ${documentType === 'quote' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : settings.isCreditNote ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'} text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 flex items-center gap-2`}>
          {isSubmitting ? 'Wird gespeichert...' : editId ? 'Änderungen speichern' : documentType === 'quote' ? 'Angebot erstellen' : settings.isCreditNote ? 'Gutschrift finalisieren' : 'Rechnung finalisieren'}
        </button>
      </div>
    </form>

    {/* Customer Search Modal */}
    {showCustomerSearch && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCustomerSearch(false)} />
        <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl relative z-[210] overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Bestandskunden suchen</h3>
              <p className="text-xs text-slate-500 font-medium">Suchen Sie nach Name, E-Mail oder Kundennummer</p>
            </div>
            <button onClick={() => setShowCustomerSearch(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <div className="p-6">
            <div className="relative mb-6">
              <input 
                autoFocus
                className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none font-bold text-slate-900 text-lg transition-all pr-12" 
                placeholder="Name, E-Mail oder K-Nummer..." 
                value={searchQuery}
                onChange={e => {
                  const q = e.target.value
                  setSearchQuery(q)
                  if (q.length >= 2) {
                    setIsSearchingCustomers(true)
                    searchCustomersAction(q).then(res => {
                      setCustomerResults(res)
                      setIsSearchingCustomers(false)
                    })
                  } else {
                    setCustomerResults([])
                  }
                }}
              />
              <div className="absolute right-4 top-4.5 text-slate-400">
                {isSearchingCustomers ? (
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                )}
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {customerResults.length > 0 ? (
                customerResults.map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => selectCustomer(c)}
                    className="w-full p-5 text-left hover:bg-blue-50 border border-slate-100 rounded-2xl transition-all flex justify-between items-center group hover:border-blue-200 hover:shadow-md"
                  >
                    <div>
                      <div className="font-bold text-slate-900 group-hover:text-blue-600 text-lg">{c.name}</div>
                      <div className="text-sm text-slate-500 font-medium">{c.email}</div>
                      <div className="text-xs text-slate-400 mt-1 italic">{c.street}, {c.zip} {c.city}</div>
                    </div>
                    <div className="text-right space-y-2">
                      <div className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-tighter border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        {c.customerNumber || 'Kunde'}
                      </div>
                      {c.vatCheckResult && (
                        <div className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase flex flex-col items-end ${c.vatCheckResult === 'VALID' ? 'text-green-600 bg-green-50 border-green-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
                          <span>UST: {c.vatCheckResult === 'VALID' ? 'GÜLTIG' : 'UNGÜLTIG'}</span>
                          {c.lastVatCheckAt && (
                            <span className="text-[7px] opacity-60 font-bold">{new Date(c.lastVatCheckAt).toLocaleDateString('de-DE')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                ))
              ) : searchQuery.length < 2 && !isSearchingCustomers && customerResults.length > 0 ? (
                // Show initial results even for short query
                customerResults.map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => selectCustomer(c)}
                    className="w-full p-5 text-left hover:bg-blue-50 border border-slate-100 rounded-2xl transition-all flex justify-between items-center group hover:border-blue-200 hover:shadow-md"
                  >
                    <div>
                      <div className="font-bold text-slate-900 group-hover:text-blue-600 text-lg">{c.name}</div>
                      <div className="text-sm text-slate-500 font-medium">{c.email}</div>
                      <div className="text-xs text-slate-400 mt-1 italic">{c.street}, {c.zip} {c.city}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-tighter border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        {c.customerNumber || 'Kunde'}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <p className="font-medium">Tippen Sie mindestens 2 Zeichen ein...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

    {showVatModal && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowVatModal(false)} />
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl relative z-[210] flex flex-col max-h-[90vh] border border-slate-200 animate-in zoom-in-95 duration-300">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">USt-IdNr. Validierung</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Statusprüfung & Dokumentation</p>
            </div>
            <button 
              onClick={() => setShowVatModal(false)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white hover:shadow-md transition-all text-slate-400 hover:text-slate-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="p-8 space-y-8 overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">Schnittstelle wählen</span>
                <div className="flex gap-2 flex-1">
                  <button 
                    type="button" 
                    onClick={() => setActiveVatProvider('VIES')} 
                    className={`flex-1 px-4 py-3 font-bold rounded-xl transition-all text-xs border ${activeVatProvider === 'VIES' ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200 scale-[1.02]' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                  >
                    EU-Schnittstelle (VIES)
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActiveVatProvider('EVATR')} 
                    className={`flex-1 px-4 py-3 font-bold rounded-xl transition-all text-xs border ${activeVatProvider === 'EVATR' ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200 scale-[1.02]' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                  >
                    Deutsche Schnittstelle (eVatR)
                  </button>
                </div>
              </div>

              {activeVatProvider === 'EVATR' && customer.vatId.toUpperCase().startsWith('DE') ? (
                <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex gap-3">
                    <span className="text-amber-600 text-xl font-bold">!</span>
                    <p className="text-sm text-amber-900 font-medium leading-relaxed">
                      Mit dieser Schnittstelle können nur ausländische USt-IdNrn. überprüft werden.
                    </p>
                  </div>
                </div>
              ) : activeVatProvider !== 'NONE' && (
                <div className="p-8 bg-slate-50 rounded-2xl border border-slate-100 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Eigene USt-IdNr. für die Abfrage</label>
                    <select 
                      className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-900 shadow-sm transition-all"
                      value={ownVatId}
                      onChange={e => setOwnVatId(e.target.value)}
                    >
                      <option value="">Bitte wählen...</option>
                      {companyVatId && <option value={companyVatId}>{companyVatId}</option>}
                    </select>
                  </div>
                  
                  <div className="pt-2">
                    <button 
                      type="button" 
                      onClick={() => handleValidateVat(activeVatProvider as any)}
                      disabled={!ownVatId || vatCheckStatus.status === 'checking'}
                      className="w-full py-4 bg-slate-900 text-white font-black rounded-xl hover:bg-blue-600 transition-all disabled:opacity-30 flex items-center justify-center gap-3 shadow-xl hover:shadow-blue-200 active:scale-[0.98]"
                    >
                      {vatCheckStatus.status === 'checking' ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Prüfung läuft...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span>Abfrage jetzt starten</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {vatCheckStatus.status !== 'idle' && vatCheckStatus.status !== 'checking' && (
                <div className="p-8 bg-white border-2 border-slate-100 rounded-3xl shadow-sm relative overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                  <div className={`absolute left-0 top-0 bottom-0 w-2 ${
                    vatCheckStatus.status === 'valid' ? 'bg-green-500' : 
                    (vatCheckStatus.status === 'uncertain' ? 'bg-amber-500' : 'bg-red-500')
                  }`} />
                  <div className="space-y-6">
                    {vatCheckStatus.status === 'uncertain' && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-bold text-amber-700 leading-snug">
                        {vatCheckStatus.message || 'Der Dienst ist derzeit nicht erreichbar.'}
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${
                          vatCheckStatus.status === 'valid' ? 'bg-green-100 text-green-600' : 
                          (vatCheckStatus.status === 'uncertain' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600')
                        }`}>
                          {vatCheckStatus.status === 'valid' ? '✓' : (vatCheckStatus.status === 'uncertain' ? '⌛' : '!')}
                        </div>
                        <div>
                          <p className="text-lg font-black text-slate-900 tracking-tight">
                            Status: {vatCheckStatus.status === 'valid' ? 'GÜLTIG' : (vatCheckStatus.status === 'uncertain' ? 'PRÜFUNG NICHT MÖGLICH' : 'UNGÜLTIG')}
                          </p>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                            {vatCheckStatus.provider === 'VIES' ? 'EU-Schnittstelle' : 'BZSt eVatR'} • {vatCheckStatus.lastChecked && new Date(vatCheckStatus.lastChecked).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                      <div>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Eigene USt-IdNr.</p>
                        <p className="text-sm text-slate-700 font-bold">{vatCheckStatus.ownVatId || '---'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Abfrage-Nummer</p>
                        <p className="text-sm text-slate-700 font-bold font-mono tracking-tighter">{vatCheckStatus.requestIdentifier || '---'}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Hinterlegter Firmenname</p>
                          <p className="text-xs text-slate-600 font-medium italic">{vatCheckStatus.name || 'Keine Daten verfügbar'}</p>
                        </div>
                        {vatCheckStatus.status === 'valid' && vatCheckStatus.name && vatCheckStatus.name !== '---' && vatCheckStatus.name.toLowerCase() !== customer.name.toLowerCase() && (
                          <button 
                            type="button"
                            onClick={() => {
                              const vAddr = vatCheckStatus.address || ''
                              const addrLines = vAddr.split('\n').map((l: string) => l.trim())
                              const street = addrLines[0] || ''
                              const lastLine = addrLines[addrLines.length - 1] || ''
                              const zipMatch = lastLine.match(/^(\d+)\s+(.+)$/)
                              
                              setCustomer({
                                ...customer,
                                name: vatCheckStatus.name!,
                                street: street || customer.street,
                                zip: zipMatch ? zipMatch[1] : customer.zip,
                                city: zipMatch ? zipMatch[2] : (lastLine || customer.city)
                              })
                              setShowVatModal(false)
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-black rounded-lg hover:bg-blue-700 transition-all uppercase tracking-tight shadow-lg shadow-blue-100"
                          >
                            Daten übernehmen
                          </button>
                        )}
                      </div>
                      {vatCheckStatus.status === 'valid' && vatCheckStatus.name && vatCheckStatus.name !== '---' && vatCheckStatus.name.toLowerCase() !== customer.name.toLowerCase() && (
                        <p className="text-[10px] text-amber-600 font-bold">⚠ Name weicht vom Register ab</p>
                      )}
                      {vatCheckStatus.status === 'valid' && vatCheckStatus.provider === 'VIES' && customer.vatId.toUpperCase().startsWith('DE') && (!vatCheckStatus.name || vatCheckStatus.name === '---') && (
                        <p className="text-[10px] text-slate-500 italic mt-2 bg-slate-100 p-2 rounded-lg">
                          Hinweis: Die EU-Schnittstelle (VIES) gibt für deutsche USt-IdNrn. oft keine Namensdaten aus. Nutzen Sie hierfür bitte die "Deutsche Schnittstelle".
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
            <button 
              onClick={() => setShowVatModal(false)}
              className="px-6 py-3 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-sm"
            >
              Fenster schließen
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
