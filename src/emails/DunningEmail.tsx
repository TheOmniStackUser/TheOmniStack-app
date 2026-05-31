import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Tailwind,
  Row,
  Column,
} from '@react-email/components'
import * as React from 'react'

export type DunningStage = 'reminder' | 'first' | 'second'

interface DunningEmailProps {
  stage: DunningStage
  recipientName: string
  invoiceNumber: string
  invoiceDate: string   // e.g. "01.05.2025"
  dueDate: string       // e.g. "15.05.2025"
  amount: string        // e.g. "123,45 €"
  companyName: string
  companyEmail?: string
  iban?: string
  bic?: string
  feeAmount?: string    // e.g. "5,00 €" – informational only
  customBody?: string   // override body text from DB template
  pdfUrl?: string
}

const stageConfig = {
  reminder: {
    label: 'Zahlungserinnerung',
    preview: 'Freundliche Erinnerung an Ihre offene Rechnung',
    accentColor: '#2563eb',
    accentBg: '#eff6ff',
    accentBorder: '#bfdbfe',
    icon: '📋',
    urgency: 'freundlich',
  },
  first: {
    label: '1. Mahnung',
    preview: 'Erste Mahnung – Bitte begleichen Sie Ihre offene Rechnung',
    accentColor: '#d97706',
    accentBg: '#fffbeb',
    accentBorder: '#fcd34d',
    icon: '⚠️',
    urgency: 'dringend',
  },
  second: {
    label: '2. Mahnung',
    preview: '2. Mahnung – Letzte Aufforderung zur Zahlung Ihrer offenen Rechnung',
    accentColor: '#dc2626',
    accentBg: '#fef2f2',
    accentBorder: '#fca5a5',
    icon: '🔴',
    urgency: 'sehr dringend',
  },
}

const defaultBodies: Record<DunningStage, (p: DunningEmailProps) => string> = {
  reminder: (p) => `wir möchten Sie freundlich daran erinnern, dass die Zahlung für Rechnung Nr. ${p.invoiceNumber} vom ${p.invoiceDate} in Höhe von ${p.amount} am ${p.dueDate} fällig war.

Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.

Bitte überweisen Sie den Betrag auf das unten angegebene Konto.`,

  first: (p) => `trotz unserer vorherigen Zahlungserinnerung haben wir für Rechnung Nr. ${p.invoiceNumber} vom ${p.invoiceDate} in Höhe von ${p.amount} noch keinen Zahlungseingang verzeichnen können.

Wir bitten Sie daher, den ausstehenden Betrag umgehend zu begleichen.

Sollte Ihre Zahlung unsere Mahnung gekreuzt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.`,

  second: (p) => `leider mussten wir feststellen, dass unser erstes Mahnschreiben bezüglich Rechnung Nr. ${p.invoiceNumber} vom ${p.invoiceDate} über ${p.amount} ohne Reaktion geblieben ist.

Wir fordern Sie hiermit letztmalig auf, den ausstehenden Betrag innerhalb von 7 Tagen zu begleichen.

Sollte bis zum Ablauf dieser Frist keine Zahlung eingehen, sehen wir uns gezwungen, rechtliche Schritte einzuleiten oder die Forderung an ein Inkassounternehmen zu übergeben.`,
}

function formatSalutation(fullName: string | null | undefined): string {
  if (!fullName) return 'Sehr geehrte Damen und Herren'
  
  const trimmed = fullName.trim()
  if (!trimmed || trimmed.toLowerCase() === 'kunde') {
    return 'Sehr geehrte Damen und Herren'
  }

  // Check for company keywords
  const companyKeywords = [
    'gmbh', 'ag', 'gbr', 'ohg', 'kg', 'e.k.', 'inc.', 'co.', 'corp', 'ltd', 'ug', 'b.v.', 's.a.r.l.', 'e.v.', 'ev', 'verwaltung', 'abteilung'
  ]
  const lowerName = trimmed.toLowerCase()
  if (companyKeywords.some(keyword => lowerName.includes(keyword))) {
    return 'Sehr geehrte Damen und Herren'
  }

  // Detect explicit prefix
  if (trimmed.startsWith('Herr ') || trimmed.startsWith('Herrn ')) {
    const nameWithoutPrefix = trimmed.replace(/^(Herrn?\s+)/i, '').trim()
    const parts = nameWithoutPrefix.split(/\s+/)
    const lastName = parts[parts.length - 1]
    return `Sehr geehrter Herr ${lastName}`
  }
  if (trimmed.startsWith('Frau ')) {
    const nameWithoutPrefix = trimmed.replace(/^(Frau\s+)/i, '').trim()
    const parts = nameWithoutPrefix.split(/\s+/)
    const lastName = parts[parts.length - 1]
    return `Sehr geehrte Frau ${lastName}`
  }

  // If there are multiple words, try to guess if it's a person
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    const firstName = parts[0]
    const lastName = parts[parts.length - 1]

    const lowerFirst = firstName.toLowerCase()
    
    // Heuristic for female name ending in German/English
    const isFemale = /^[a-z]+(a|e|i|y|gitta|gunde|hild|trud|nne|tte|lle|na|ma|ia|ea|ra|sa|da|la|ka)$/i.test(lowerFirst) && 
                     !/^(andre|rene|sacha|sascha|luca|mika|niklas|jonas|tobias|matthias|elias|thomas|nils|lars|jens|hannes|klaus|hans)$/i.test(lowerFirst)
    
    const isMale = /^[a-z]+(o|us|er|as|an|lf|rt|nd|ut|or|ph|ax|rd|ck|m|n)$/i.test(lowerFirst) || 
                   /^(andre|rene|sacha|sascha|luca|mika|niklas|jonas|tobias|matthias|elias|thomas|nils|lars|jens|hannes|klaus|hans|alexander)$/i.test(lowerFirst)

    if (isFemale) {
      return `Sehr geehrte Frau ${lastName}`
    }
    if (isMale) {
      return `Sehr geehrter Herr ${lastName}`
    }

    return `Sehr geehrte(r) Frau/Herr ${lastName}`
  }

  return `Sehr geehrte(r) Frau/Herr ${trimmed}`
}

export const DunningEmail = ({
  stage = 'reminder',
  recipientName = 'Kunde',
  invoiceNumber = 'INV-2025-0001',
  invoiceDate = '01.05.2025',
  dueDate = '15.05.2025',
  amount = '123,45 €',
  companyName = 'Ihr Unternehmen',
  companyEmail,
  iban,
  bic,
  feeAmount,
  customBody,
  pdfUrl,
}: DunningEmailProps) => {
  const config = stageConfig[stage]
  const rawBodyText = customBody || defaultBodies[stage]({
    stage, recipientName, invoiceNumber, invoiceDate, dueDate,
    amount, companyName, companyEmail, iban, bic, feeAmount, pdfUrl,
  })

  // Normalize greeting and closing
  const hasGreetingInBody = /^\s*sehr\s+geehrte/i.test(rawBodyText)
  
  let finalBody = rawBodyText.trim()
  const hasClosing = /mit\s+freundlichen/i.test(finalBody)
  if (!hasClosing) {
    finalBody = finalBody + `\n\nMit freundlichen Grüßen,\n${companyName}`
  }

  return (
    <Html>
      <Head />
      <Preview>{config.preview}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white border border-gray-200 rounded-xl my-[40px] mx-auto p-0 w-[520px] shadow-sm overflow-hidden">

            {/* ── Header stripe ── */}
            <Section
              style={{
                backgroundColor: config.accentColor,
                padding: '24px 32px',
              }}
            >
              <Row>
                <Column>
                  <Img
                    src="https://app.theomnistack.de/apple-icon.png"
                    width="40"
                    height="40"
                    alt="TheOmniStack Logo"
                    style={{ borderRadius: '8px', display: 'inline-block', verticalAlign: 'middle', marginRight: '12px' }}
                  />
                  <Text
                    style={{
                      display: 'inline-block',
                      verticalAlign: 'middle',
                      color: '#ffffff',
                      fontSize: '16px',
                      fontWeight: '700',
                      margin: 0,
                    }}
                  >
                    {config.icon} {config.label}
                  </Text>
                </Column>
              </Row>
            </Section>

            {/* ── Body ── */}
            <Section style={{ padding: '32px 32px 0 32px' }}>
              {!hasGreetingInBody && (
                <Heading
                  style={{
                    color: '#111827',
                    fontSize: '20px',
                    fontWeight: '700',
                    margin: '0 0 16px 0',
                  }}
                >
                  {formatSalutation(recipientName)},
                </Heading>
              )}

              {finalBody.split('\n').map((line, i) =>
                line.trim() === '' ? (
                  <br key={i} />
                ) : (
                  <Text key={i} style={{ color: '#374151', fontSize: '14px', lineHeight: '24px', margin: '0 0 8px 0' }}>
                    {line}
                  </Text>
                )
              )}
            </Section>

            {/* ── Invoice Info Box ── */}
            <Section style={{ padding: '16px 32px' }}>
              <div
                style={{
                  backgroundColor: config.accentBg,
                  border: `1px solid ${config.accentBorder}`,
                  borderRadius: '10px',
                  padding: '16px 20px',
                }}
              >
                <Text style={{ color: '#6b7280', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px 0' }}>
                  Rechnungsdetails
                </Text>
                <Row style={{ marginBottom: '6px' }}>
                  <Column style={{ width: '50%' }}>
                    <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>Rechnungsnummer</Text>
                    <Text style={{ color: '#111827', fontSize: '14px', fontWeight: '600', margin: '2px 0 0 0' }}>{invoiceNumber}</Text>
                  </Column>
                  <Column style={{ width: '50%' }}>
                    <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>Rechnungsdatum</Text>
                    <Text style={{ color: '#111827', fontSize: '14px', fontWeight: '600', margin: '2px 0 0 0' }}>{invoiceDate}</Text>
                  </Column>
                </Row>
                <Row style={{ marginTop: '8px' }}>
                  <Column style={{ width: '50%' }}>
                    <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>Fälligkeitsdatum</Text>
                    <Text style={{ color: config.accentColor, fontSize: '14px', fontWeight: '700', margin: '2px 0 0 0' }}>{dueDate}</Text>
                  </Column>
                  <Column style={{ width: '50%' }}>
                    <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>Offener Betrag</Text>
                    <Text style={{ color: config.accentColor, fontSize: '18px', fontWeight: '800', margin: '2px 0 0 0' }}>{amount}</Text>
                  </Column>
                </Row>
                {feeAmount && (
                  <Row style={{ marginTop: '8px' }}>
                    <Column>
                      <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>Mahngebühr (informativ)</Text>
                      <Text style={{ color: '#dc2626', fontSize: '14px', fontWeight: '600', margin: '2px 0 0 0' }}>+ {feeAmount}</Text>
                    </Column>
                  </Row>
                )}
              </div>
            </Section>

            {/* ── Payment Info ── */}
            {(iban || bic) && (
              <Section style={{ padding: '0 32px 16px 32px' }}>
                <div
                  style={{
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '16px 20px',
                  }}
                >
                  <Text style={{ color: '#6b7280', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px 0' }}>
                    Bankverbindung
                  </Text>
                  {iban && (
                    <Row style={{ marginBottom: '4px' }}>
                      <Column style={{ width: '40%' }}>
                        <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>IBAN</Text>
                      </Column>
                      <Column>
                        <Text style={{ color: '#111827', fontSize: '13px', fontWeight: '600', fontFamily: 'monospace', margin: 0 }}>{iban}</Text>
                      </Column>
                    </Row>
                  )}
                  {bic && (
                    <Row>
                      <Column style={{ width: '40%' }}>
                        <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>BIC</Text>
                      </Column>
                      <Column>
                        <Text style={{ color: '#111827', fontSize: '13px', fontWeight: '600', fontFamily: 'monospace', margin: 0 }}>{bic}</Text>
                      </Column>
                    </Row>
                  )}
                  <Row style={{ marginTop: '8px' }}>
                    <Column style={{ width: '40%' }}>
                      <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>Verwendungszweck</Text>
                    </Column>
                    <Column>
                      <Text style={{ color: '#111827', fontSize: '13px', fontWeight: '600', margin: 0 }}>{invoiceNumber}</Text>
                    </Column>
                  </Row>
                </div>
              </Section>
            )}

            {/* ── CTA for PDF ── */}
            {pdfUrl && (
              <Section style={{ padding: '0 32px 16px 32px', textAlign: 'center' }}>
                <a
                  href={pdfUrl}
                  style={{
                    display: 'inline-block',
                    backgroundColor: config.accentColor,
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    textDecoration: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                  }}
                >
                  📄 Rechnung als PDF öffnen
                </a>
              </Section>
            )}

            <Hr style={{ borderColor: '#e5e7eb', margin: '0 32px' }} />

            {/* ── Footer ── */}
            <Section style={{ padding: '16px 32px 24px 32px' }}>
              <Text style={{ color: '#9ca3af', fontSize: '11px', lineHeight: '18px', margin: 0 }}>
                Diese Nachricht wurde automatisch von {companyName} versendet.
                {companyEmail && ` Bei Fragen wenden Sie sich bitte an ${companyEmail}.`}
                {' '}Wenn Sie diese Zahlung bereits veranlasst haben, bitten wir Sie, dieses Schreiben zu ignorieren.
              </Text>
            </Section>

          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

export default DunningEmail
