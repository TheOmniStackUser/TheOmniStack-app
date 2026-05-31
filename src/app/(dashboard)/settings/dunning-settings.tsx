'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  getDunningRulesAction,
  saveDunningRulesAction,
  getDunningExclusionsAction,
  addDunningExclusionAction,
  removeDunningExclusionAction,
  getDunningLogsAction,
  triggerDunningCheckManuallyAction,
  getOverdueInvoiceStatsAction,
  type DunningRuleInput,
} from '@/app/actions/dunning'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { DunningStage } from '@/emails/DunningEmail'

// ─── Types ────────────────────────────────────────────────────────────────────
type RuleWithId = DunningRuleInput & { id: string | null }
type Exclusion = { id: string; recipientEmail: string; reason: string | null; createdAt: Date }
type DunningLog = {
  id: string; stage: string; status: string; recipientEmail: string; subject: string
  errorMessage: string | null; sentAt: Date; invoiceNumber: string | null
  recipientName: string | null; totalAmount: string | null; currency: string | null
}

// ─── Stage Config ─────────────────────────────────────────────────────────────
const STAGE_META: Record<DunningStage, { label: string; color: string; bg: string; border: string; icon: string }> = {
  reminder: { label: 'Zahlungserinnerung', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: '📋' },
  first:    { label: '1. Mahnung',         color: '#d97706', bg: '#fffbeb', border: '#fcd34d', icon: '⚠️' },
  second:   { label: '2. Mahnung',         color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '🔴' },
}

const PLACEHOLDERS = ['{Empfänger}', '{Nummer}', '{Datum}', '{Fälligkeitsdatum}', '{Betrag}', '{Unternehmen}']

function formatAmount(val: string | number | null, currency = 'EUR') {
  if (!val) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(Number(val))
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DunningSettings({
  smtpSettings,
}: {
  smtpSettings?: { enabled: boolean; fromEmail?: string }
}) {
  const [activeTab, setActiveTab] = useState<'rules' | 'exclusions' | 'history'>('rules')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Rules
  const [rules, setRules] = useState<RuleWithId[]>([])
  const [rulesLoading, setRulesLoading] = useState(true)
  const [expandedStage, setExpandedStage] = useState<DunningStage | null>(null)
  const [isSavingRules, setIsSavingRules] = useState(false)

  // Exclusions
  const [exclusions, setExclusions] = useState<Exclusion[]>([])
  const [exclusionsLoading, setExclusionsLoading] = useState(false)
  const [newExclusionEmail, setNewExclusionEmail] = useState('')
  const [newExclusionReason, setNewExclusionReason] = useState('')
  const [isAddingExclusion, setIsAddingExclusion] = useState(false)

  // History
  const [logs, setLogs] = useState<DunningLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Stats
  const [overdueStats, setOverdueStats] = useState<{ count: number; totalAmount: number } | null>(null)
  const [isTriggering, setIsTriggering] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  // Load rules on mount
  useEffect(() => {
    getDunningRulesAction().then((data) => {
      setRules(data as RuleWithId[])
      setRulesLoading(false)
    }).catch(() => setRulesLoading(false))

    getOverdueInvoiceStatsAction().then(setOverdueStats).catch(() => {})
  }, [])

  // Load tab data lazily
  useEffect(() => {
    if (activeTab === 'exclusions' && exclusions.length === 0) {
      setExclusionsLoading(true)
      getDunningExclusionsAction().then((data) => {
        setExclusions(data as Exclusion[])
        setExclusionsLoading(false)
      }).catch(() => setExclusionsLoading(false))
    }
    if (activeTab === 'history' && logs.length === 0) {
      setLogsLoading(true)
      getDunningLogsAction().then((data) => {
        setLogs(data as unknown as DunningLog[])
        setLogsLoading(false)
      }).catch(() => setLogsLoading(false))
    }
  }, [activeTab])

  // ── Rule Helpers ──────────────────────────────────────────────────────────
  const updateRule = (stage: DunningStage, patch: Partial<DunningRuleInput>) => {
    setRules((prev) => prev.map((r) => r.stage === stage ? { ...r, ...patch } : r))
  }

  const handleSaveRules = async () => {
    setIsSavingRules(true)
    try {
      const result = await saveDunningRulesAction(rules)
      if ((result as any).error) throw new Error((result as any).error)
      showToast('Mahnwesen-Regeln wurden gespeichert.')
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Speichern.', 'error')
    } finally {
      setIsSavingRules(false)
    }
  }

  // ── Exclusions ────────────────────────────────────────────────────────────
  const handleAddExclusion = async () => {
    if (!newExclusionEmail.trim()) return
    setIsAddingExclusion(true)
    try {
      const result = await addDunningExclusionAction(newExclusionEmail.trim(), newExclusionReason.trim())
      if ((result as any).error) throw new Error((result as any).error)
      const refreshed = await getDunningExclusionsAction()
      setExclusions(refreshed as Exclusion[])
      setNewExclusionEmail('')
      setNewExclusionReason('')
      showToast('Ausschluss hinzugefügt.')
    } catch (err: any) {
      showToast(err.message || 'Fehler.', 'error')
    } finally {
      setIsAddingExclusion(false)
    }
  }

  const handleRemoveExclusion = async (id: string) => {
    try {
      await removeDunningExclusionAction(id)
      setExclusions((prev) => prev.filter((e) => e.id !== id))
      showToast('Ausschluss entfernt.')
    } catch {
      showToast('Fehler beim Entfernen.', 'error')
    }
  }

  // ── Manual Trigger ────────────────────────────────────────────────────────
  const handleManualTrigger = async () => {
    setIsTriggering(true)
    try {
      const result = await triggerDunningCheckManuallyAction()
      if ((result as any).error) throw new Error((result as any).error)
      showToast('Mahnwesen-Prüfung wurde in die Warteschlange gestellt.')
    } catch (err: any) {
      showToast(err.message || 'Fehler.', 'error')
    } finally {
      setIsTriggering(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const anyEnabled = rules.some((r) => r.isEnabled)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-lg">
            🔔
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Automatisches Mahnwesen</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Zahlungserinnerungen und Mahnungen automatisch per E-Mail versenden
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {anyEnabled && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Aktiv
            </span>
          )}
          <button
            onClick={handleManualTrigger}
            disabled={isTriggering}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isTriggering ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3l14 9-14 9V3z" />
              </svg>
            )}
            Jetzt prüfen
          </button>
        </div>
      </div>

      {/* Overdue Stats Banner */}
      {overdueStats && overdueStats.count > 0 && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-amber-800">
            <strong>{overdueStats.count} überfällige Rechnungen</strong> mit einem Gesamtbetrag von{' '}
            <strong>{formatAmount(overdueStats.totalAmount)}</strong> warten auf Bearbeitung.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-6 mt-4">
        {([['rules', 'Regeln'], ['exclusions', 'Ausschlüsse'], ['history', 'Verlauf']] as [string, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Rules ── */}
      {activeTab === 'rules' && (
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">
            Konfiguriere bis zu drei automatische Mahnstufen. Verfügbare Platzhalter:{' '}
            {PLACEHOLDERS.map((p) => (
              <code key={p} className="text-xs bg-gray-100 text-gray-700 px-1 rounded mr-1">{p}</code>
            ))}
          </p>

          {rulesLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const meta = STAGE_META[rule.stage as DunningStage]
                const isExpanded = expandedStage === rule.stage

                return (
                  <div
                    key={rule.stage}
                    className="border rounded-xl overflow-hidden transition-all"
                    style={{ borderColor: rule.isEnabled ? meta.border : '#e5e7eb' }}
                  >
                    {/* Stage Header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      style={{ backgroundColor: rule.isEnabled ? meta.bg : undefined }}
                      onClick={() => setExpandedStage(isExpanded ? null : rule.stage as DunningStage)}
                    >
                      <span className="text-lg">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900">{meta.label}</span>
                          {rule.isEnabled && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                              Aktiv
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {rule.isEnabled
                            ? `${rule.daysAfterDue} Tage nach Fälligkeit`
                            : 'Deaktiviert'}
                        </p>
                      </div>

                      {/* Enable toggle */}
                      <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <div
                            className="relative w-10 h-5 rounded-full transition-colors"
                            style={{ backgroundColor: rule.isEnabled ? meta.color : '#d1d5db' }}
                            onClick={() => updateRule(rule.stage as DunningStage, { isEnabled: !rule.isEnabled })}
                          >
                            <div
                              className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                              style={{ left: rule.isEnabled ? '22px' : '2px' }}
                            />
                          </div>
                        </label>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Config */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 p-4 space-y-4 bg-white">
                        {/* Days after due */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Tage nach Fälligkeitsdatum
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={365}
                              value={rule.daysAfterDue}
                              onChange={(e) => updateRule(rule.stage as DunningStage, { daysAfterDue: parseInt(e.target.value) || 0 })}
                              className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-500">Tage</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Die Mahnung wird versendet, wenn die Rechnung mindestens diese Anzahl Tage überfällig ist.</p>
                        </div>

                        {/* Fee */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Mahngebühr (optional)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              placeholder="0.00"
                              value={rule.feeAmount ?? ''}
                              onChange={(e) => updateRule(rule.stage as DunningStage, { feeAmount: e.target.value || null })}
                              className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-500">EUR</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Wird direkt als neue Position in der Rechnung aufgeführt und das PDF neu generiert.</p>
                        </div>

                        {/* Respect Exclusions */}
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.respectExclusions}
                              onChange={(e) => updateRule(rule.stage as DunningStage, { respectExclusions: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Ausschlüsse für diese Mahnstufe beachten</span>
                          </label>
                          <p className="text-xs text-gray-400 mt-1">Wenn aktiviert, werden E-Mail-Adressen auf der Ausschlussliste bei dieser Stufe übersprungen.</p>
                        </div>

                        {/* Sender Email */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Absender
                          </label>
                          <select
                            value={rule.senderEmail || 'noreply@theomnistack.de'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateRule(rule.stage as DunningStage, {
                                senderEmail: val === 'noreply@theomnistack.de' ? null : val,
                              });
                            }}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="noreply@theomnistack.de">noreply@theomnistack.de (System-Standard)</option>
                            {smtpSettings?.enabled && smtpSettings.fromEmail && (
                              <option value={smtpSettings.fromEmail}>
                                {smtpSettings.fromEmail} (Eigener Mailserver)
                              </option>
                            )}
                          </select>
                        </div>

                        {/* Subject */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Betreff</label>
                          <input
                            type="text"
                            value={rule.subjectTemplate}
                            onChange={(e) => updateRule(rule.stage as DunningStage, { subjectTemplate: e.target.value })}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={`${meta.label}: Rechnung {Nummer}`}
                          />
                        </div>

                        {/* Body */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">E-Mail-Text</label>
                          <textarea
                            rows={7}
                            value={rule.bodyTemplate}
                            onChange={(e) => updateRule(rule.stage as DunningStage, { bodyTemplate: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
                            placeholder="E-Mail-Text eingeben..."
                          />
                          <p className="text-xs text-gray-400 mt-1">Anrede und Grußformel werden automatisch ergänzt. Hier nur den Haupttext eingeben.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Save Button */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveRules}
              disabled={isSavingRules || rulesLoading}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSavingRules ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              )}
              Regeln speichern
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Exclusions ── */}
      {activeTab === 'exclusions' && (
        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-500">
            Kunden mit diesen E-Mail-Adressen werden vollständig vom automatischen Mahnwesen ausgeschlossen.
          </p>

          {/* Add exclusion */}
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="kunde@beispiel.de"
              value={newExclusionEmail}
              onChange={(e) => setNewExclusionEmail(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Grund (optional)"
              value={newExclusionReason}
              onChange={(e) => setNewExclusionReason(e.target.value)}
              className="w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleAddExclusion}
              disabled={isAddingExclusion || !newExclusionEmail}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0"
            >
              {isAddingExclusion ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              )}
              Hinzufügen
            </button>
          </div>

          {/* Exclusions list */}
          {exclusionsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : exclusions.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">
              Keine Ausschlüsse vorhanden.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">E-Mail</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Grund</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Hinzugefügt</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {exclusions.map((ex) => (
                    <tr key={ex.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{ex.recipientEmail}</td>
                      <td className="px-4 py-2.5 text-gray-500">{ex.reason || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {format(new Date(ex.createdAt), 'dd.MM.yyyy', { locale: de })}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => handleRemoveExclusion(ex.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Entfernen"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: History ── */}
      {activeTab === 'history' && (
        <div className="p-6">
          {logsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">
              Noch keine Mahnungen versendet.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Datum</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Rechnung</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Stufe</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Empfänger</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-600">Betrag</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => {
                    const meta = STAGE_META[log.stage as DunningStage] || STAGE_META.reminder
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                          {format(new Date(log.sentAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900">{log.invoiceNumber || '—'}</div>
                          <div className="text-xs text-gray-400">{log.recipientName}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
                          >
                            {meta.icon} {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{log.recipientEmail}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                          {formatAmount(log.totalAmount, log.currency || 'EUR')}
                        </td>
                        <td className="px-4 py-2.5">
                          {log.status === 'sent' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              ✓ Gesendet
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full" title={log.errorMessage || ''}>
                              ✗ Fehler
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-white border-green-200 text-green-800'
              : 'bg-white border-red-200 text-red-800'
          }`}
        >
          {toast.type === 'success' ? (
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
