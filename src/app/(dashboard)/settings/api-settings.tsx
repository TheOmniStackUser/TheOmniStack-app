'use client'

import { useState, useEffect } from 'react'
import { getApiKeyAction, generateApiKeyAction } from '@/app/actions/api-keys'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Key, RefreshCw, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

export function ApiSettings() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getApiKeyAction().then((key) => {
      setApiKey(key || null)
      setLoading(false)
    })
  }, [])

  const handleGenerate = async () => {
    setLoading(true)
    const newKey = await generateApiKeyAction()
    setApiKey(newKey)
    setLoading(false)
    toast.success('Neuer API-Key wurde generiert')
  }

  const copyToClipboard = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setCopied(true)
      toast.success('API-Key kopiert')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          Mobile App & API
        </CardTitle>
        <CardDescription>
          Nutze diesen Key, um die OmniScan App mit deinem Account zu verbinden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input 
            value={loading ? 'Lädt...' : (apiKey || 'Kein Key vorhanden')} 
            readOnly 
            type={apiKey ? 'text' : 'password'}
            className="font-mono bg-slate-50"
          />
          {apiKey && (
            <Button variant="outline" size="icon" onClick={copyToClipboard}>
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          )}
        </div>
        <Button 
          variant="secondary" 
          onClick={handleGenerate} 
          disabled={loading}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {apiKey ? 'Neuen Key generieren' : 'API-Key erstellen'}
        </Button>
        <p className="text-xs text-slate-500">
          Hinweis: Ein neuer Key macht den alten sofort ungültig. Die App muss dann neu konfiguriert werden.
        </p>
      </CardContent>
    </Card>
  )
}
