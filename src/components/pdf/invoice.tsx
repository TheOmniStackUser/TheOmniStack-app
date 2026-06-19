import React from 'react'
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer'
import { format } from 'date-fns'

const styles = StyleSheet.create({
  page: { 
    padding: '40px 50px', 
    fontSize: 9, 
    fontFamily: 'Helvetica', 
    color: '#000' 
  },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 150 },
  
  topSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  
  leftCol: { width: '50%' },
  senderLine: { fontSize: 8, borderBottom: '1px solid #000', paddingBottom: 2, marginBottom: 15 },
  recipientBlock: { fontSize: 10, lineHeight: 1.3 },
  bold: { fontWeight: 'bold' },
  
  rightCol: { width: '40%' },
  contactTitle: { fontSize: 10, fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: 2, marginBottom: 10 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 60, color: '#000' },
  value: { flex: 1 },
  valueBold: { flex: 1, fontWeight: 'bold' },
  
  infoSection: { marginTop: 20 },
  
  titleBlock: { marginBottom: 30 },
  mainTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  
  table: { marginTop: 20 },
  tableHeader: { flexDirection: 'row', borderBottom: '2px solid #000', paddingBottom: 5, marginBottom: 5, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #eee', paddingVertical: 8, alignItems: 'center' },
  colPos: { width: 30 },
  colSkuTitle: { flex: 1 },
  colMenge: { width: 50, textAlign: 'right' },
  colTax: { width: 50, textAlign: 'right' },
  colPrice: { width: 70, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },
  
  summarySection: { marginTop: 30, flexDirection: 'row', justifyContent: 'flex-end' },
  summaryTable: { width: 200 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottom: '1px solid #f1f5f9' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, marginTop: 4, borderBottom: '2px solid #000', fontWeight: 'bold', fontSize: 11 },
  
  taxReasonSection: { marginTop: 10, fontSize: 9, fontStyle: 'italic' },
  returnsNoteSection: { marginTop: 30, fontSize: 9, color: '#000', backgroundColor: '#f9fafb', padding: 12, borderRadius: 4, border: '1px solid #e5e7eb' },
  footerTextSection: { marginTop: 40, fontSize: 9, color: '#000', lineHeight: 1.5 },
  pageNumber: {
    position: 'absolute',
    bottom: 80,
    right: 50,
    fontSize: 8,
    color: '#000',
  },
  
  footer: { 
    position: 'absolute', 
    bottom: 30, 
    left: 50, 
    right: 50, 
    borderTop: '1px solid #ccc', 
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6,
    color: '#000'
  },
  footerCol: { width: '30%' },
  footerLine: { marginBottom: 1 }
})

interface InvoiceProps {
  invoiceNumber: string
  date: Date
  dueDate?: Date
  orderNumber?: string
  orderDate?: Date
  buyerReference?: string
  externalId?: string
  customerNumber: string
  company: {
    name: string
    legalName?: string
    street?: string
    zip?: string
    city?: string
    country: string
    email?: string
    phone?: string
    website?: string
    vatId?: string
    taxId?: string
    bankName?: string
    bankIban?: string
    bankBic?: string
    logoUrl?: string
    paymentRecipient?: string
    management?: string
    registrationCourt?: string
    footerText?: string
    footerTextEn?: string
    internationalLanguage?: string
  }
  recipient: { name: string, company?: string, addressAddition?: string, phone?: string, street: string, zip: string, city: string, country: string }
  items: Array<{ sku?: string, title: string, quantity: number, unitPrice: number, taxRate: number }>
  currency: string
  paymentMethod?: string
  isPaid?: boolean
  isCreditNote?: boolean
  customText?: string
  taxOption?: string
  documentType?: 'invoice' | 'quote' | 'delivery_note'
  cancelsInvoiceNumber?: string
  cancelsInvoiceDate?: Date
  discountRate?: number
  skontoRate?: number
  skontoDays?: number
  showServiceDateNote?: boolean
}

export const InvoiceDocument: React.FC<InvoiceProps> = ({
  invoiceNumber,
  date,
  dueDate,
  orderNumber,
  buyerReference,
  externalId,
  customerNumber,
  company,
  recipient,
  items,
  currency = 'EUR',
  isCreditNote = false,
  paymentMethod,
  isPaid,
  customText,
  taxOption,
  orderDate,
  documentType = 'invoice',
  cancelsInvoiceNumber,
  cancelsInvoiceDate,
  discountRate = 0,
  skontoRate = 0,
  skontoDays = 0,
  showServiceDateNote = false,
}) => {
  const countryCode = (recipient.country || '').toUpperCase()
  const isGerman = countryCode === 'DE' || countryCode === 'DEU' || countryCode === 'GERMANY' || countryCode === 'DEUTSCHLAND'
  const lang = isGerman ? 'de' : (company.internationalLanguage === 'de' ? 'de' : 'en')
  const factor = cancelsInvoiceNumber ? -1 : 1

  const getCountryName = (code: string, currentLang: string) => {
    const names: Record<string, { de: string, en: string }> = {
      'DE': { de: 'Deutschland', en: 'Germany' },
      'DEU': { de: 'Deutschland', en: 'Germany' },
      'AT': { de: 'Österreich', en: 'Austria' },
      'AUT': { de: 'Österreich', en: 'Austria' },
      'CH': { de: 'Schweiz', en: 'Switzerland' },
      'CHE': { de: 'Schweiz', en: 'Switzerland' },
      'FR': { de: 'Frankreich', en: 'France' },
      'FRA': { de: 'Frankreich', en: 'France' },
      'NL': { de: 'Niederlande', en: 'Netherlands' },
      'NLD': { de: 'Niederlande', en: 'Netherlands' },
      'BE': { de: 'Belgien', en: 'Belgium' },
      'BEL': { de: 'Belgien', en: 'Belgium' },
      'IT': { de: 'Italien', en: 'Italy' },
      'ITA': { de: 'Italien', en: 'Italy' },
      'ES': { de: 'Spanien', en: 'Spain' },
      'ESP': { de: 'Spanien', en: 'Spain' },
    }
    const match = names[code.toUpperCase()]
    if (match) return currentLang === 'de' ? match.de : match.en
    return code
  }

  const countryDisplay = getCountryName(countryCode, lang)
  const t = {
    de: {
      contactTitle: 'So erreichen Sie uns',
      internet: 'Internet',
      email: 'E-Mail',
      phone: 'Telefon',
      taxId: 'St.-Nr.',
      vatId: 'USt-IdNr.',
      date: 'Datum',
      customerNr: 'Kunde',
      invoiceNr: documentType === 'quote' ? 'Angebot' : 'Rechnung',
      orderNr: 'Bestellnr.',
      orderDate: 'Bestelldatum',
      buyerRef: 'Käuferref.',
      externalId: 'Externe ID',
      invoiceTitle: 'Rechnung',
      quoteTitle: 'Angebot',
      taxNote: 'Das Rechnungsdatum entspricht dem Leistungsdatum',
      quantity: 'Menge',
      sku: 'Art.-Nr. + Bezeichnung',
      taxRate: 'MwSt.',
      price: 'Einzelpreis',
      total: 'Gesamt',
      pos: 'Pos',
      thanks: 'Sehr geehrte Damen und Herren,\nvielen Dank für Ihren Auftrag! Wir berechnen Ihnen hiermit folgende Leistungen:',
      thanksQuote: 'Sehr geehrte Damen und Herren,\nvielen Dank für Ihre Anfrage! Gerne unterbreiten wir Ihnen folgendes Angebot:',
      net: 'Gesamt Netto',
      vat: 'MwSt.',
      totalGross: 'Gesamtbetrag',
      page: 'Seite',
      dueDate: 'Zahlungsziel',
      paymentRecipient: 'Zahlungsempfänger',
      bankDetails: 'Bankverbindung',
      management: 'Geschäftsführung',
      regCourt: 'Registergericht/Nr.',
      paymentMethod: 'Zahlungsart',
      paymentStatus: 'Zahlungsstatus',
      paid: 'Bezahlt',
      pending: 'Ausstehend',
      creditNoteTitle: 'Gutschrift',
      creditNoteNr: 'Gutschrift',
      thanksCredit: 'Sehr geehrte Damen und Herren,\nnachfolgend schreiben wir Ihnen wie vorab besprochen folgenden Betrag gut:'
    },
    en: {
      contactTitle: 'How to reach us',
      internet: 'Internet',
      email: 'E-Mail',
      phone: 'Phone',
      taxId: 'Tax ID',
      vatId: 'VAT ID',
      date: 'Date',
      customerNr: 'Customer',
      invoiceNr: documentType === 'quote' ? 'Quote' : 'Invoice',
      orderNr: 'Order No.',
      orderDate: 'Order Date',
      buyerRef: 'Buyer Ref',
      externalId: 'External ID',
      invoiceTitle: 'Invoice',
      quoteTitle: 'Quote',
      taxNote: 'The invoice date corresponds to the service date',
      quantity: 'Qty',
      sku: 'SKU + Description',
      taxRate: 'VAT',
      price: 'Unit Price',
      total: 'Total',
      pos: 'Pos',
      thanks: 'Dear Sir or Madam,\nfollowing our agreement, we invoice you for:',
      thanksQuote: 'Dear Sir or Madam,\nthank you for your inquiry! We are pleased to submit the following quote:',
      net: 'Total (Net)',
      vat: 'VAT',
      totalGross: 'Total Amount',
      page: 'Page',
      dueDate: 'Due Date',
      paymentRecipient: 'Payment Recipient',
      bankDetails: 'Bank Details',
      management: 'Management',
      regCourt: 'Registration',
      paymentMethod: 'Payment Method',
      paymentStatus: 'Status',
      paid: 'Paid',
      pending: 'Pending',
      creditNoteTitle: 'Credit Note',
      creditNoteNr: 'Credit Note',
      thanksCredit: 'Dear Sir or Madam,\nfollowing our agreement, we credit you for:'
    }
  }[lang]

  const formatPrice = (val: number) => 
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ` ${currency}`

  const rawTotalNet = items.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0)
  const discountAmount = rawTotalNet * (discountRate / 100)
  const totalNet = rawTotalNet - discountAmount
  
  const taxesByRate = items.reduce((acc, item) => {
    const rate = item.taxRate
    const lineNet = item.unitPrice * item.quantity
    const discountedLineNet = lineNet * (1 - discountRate / 100)
    const lineTax = discountedLineNet * rate
    
    if (!acc[rate]) acc[rate] = { net: 0, tax: 0 }
    acc[rate].net += discountedLineNet
    acc[rate].tax += lineTax
    return acc
  }, {} as Record<number, { net: number, tax: number }>)

  const totalTax = Object.values(taxesByRate).reduce((acc, t) => acc + t.tax, 0)
  const subtotal = totalNet + totalTax // subtotal in PDF context is usually Gross total

  const currentDate = format(date, 'dd.MM.yyyy')
  const senderLineText = `${company.legalName || company.name} - ${company.street} - ${company.zip} ${company.city}`

  const getTaxReason = (option?: string) => {
    switch (option) {
      case 'kleinunternehmer': return 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
      case 'drittland': return 'Nicht steuerbare Lieferung (Drittland).'
      case 'eu_vat_id': return 'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).'
      case 'eu_no_vat_id': return 'Nicht steuerbare Lieferung (EU).'
      case 'reverse_charge': return 'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).'
      case 'innergemeinschaftlich': return 'Steuerfreie innergemeinschaftliche Lieferung.'
      case 'ausfuhr': return 'Steuerfreie Ausfuhrlieferung.'
      case 'sonstige': return 'Steuerfreie Lieferung.'
      case 'innenumsatz': return 'Nicht steuerbarer Innenumsatz.'
      default: return null
    }
  }

  const taxReason = getTaxReason(taxOption)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header with Centered Logo */}
        <View style={styles.header}>
          {company.logoUrl ? (
            <Image src={company.logoUrl} style={styles.logo} />
          ) : (
            <Text style={{ fontSize: 24, fontWeight: 'bold' }}>{company.name}</Text>
          )}
        </View>

        <View style={styles.topSection}>
          <View style={styles.leftCol}>
            <Text style={styles.senderLine}>{senderLineText}</Text>
            <View style={styles.recipientBlock}>
              {recipient.company && <Text style={styles.bold}>{recipient.company}</Text>}
              {recipient.addressAddition && <Text style={styles.bold}>{recipient.addressAddition}</Text>}
              <Text style={styles.bold}>{recipient.name}</Text>
              <Text style={styles.bold}>{recipient.street}</Text>
              <Text style={styles.bold}>{recipient.zip} {recipient.city}</Text>
              <Text style={styles.bold}>{countryDisplay}</Text>
              {recipient.phone && <Text style={{ ...styles.bold, marginTop: 5 }}>Tel: {recipient.phone}</Text>}
            </View>
          </View>

          <View style={styles.rightCol}>
            <Text style={styles.contactTitle}>{t.contactTitle}</Text>
            
            {company.website && (
              <View style={styles.row}>
                <Text style={styles.label}>{t.internet}</Text>
                <Text style={styles.value}>{company.website}</Text>
              </View>
            )}
            {company.email && (
              <View style={styles.row}>
                <Text style={styles.label}>{t.email}</Text>
                <Text style={styles.value}>{company.email}</Text>
              </View>
            )}
            {company.phone && (
              <View style={styles.row}>
                <Text style={styles.label}>{t.phone}</Text>
                <Text style={styles.value}>{company.phone}</Text>
              </View>
            )}
            
            <View style={{ marginTop: 10 }}>
              {company.taxId && (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.taxId}</Text>
                  <Text style={styles.valueBold}>{company.taxId}</Text>
                </View>
              )}
              {company.vatId && (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.vatId}</Text>
                  <Text style={styles.valueBold}>{company.vatId}</Text>
                </View>
              )}
            </View>

            <View style={styles.infoSection}>
              <View style={styles.row}>
                <Text style={styles.label}>{t.date}</Text>
                <Text style={styles.valueBold}>{currentDate}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t.customerNr}</Text>
                <Text style={styles.valueBold}>{customerNumber}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{cancelsInvoiceNumber ? 'Storno' : t.invoiceNr}</Text>
                <Text style={styles.valueBold}>{invoiceNumber}</Text>
              </View>
              {orderNumber && (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.orderNr}</Text>
                  <Text style={styles.valueBold}>{orderNumber}</Text>
                </View>
              )}
              {orderDate && (
                <View style={styles.row}>
                  <Text style={styles.label}>{isCreditNote ? (lang === 'de' ? 'Gutschriftsdatum' : 'Credit Note Date') : t.orderDate}</Text>
                  <Text style={styles.valueBold}>{format(orderDate, 'dd.MM.yyyy')}</Text>
                </View>
              )}
              {buyerReference && (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.buyerRef}</Text>
                  <Text style={styles.valueBold}>{buyerReference}</Text>
                </View>
              )}
              {externalId && (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.externalId}</Text>
                  <Text style={styles.valueBold}>{externalId}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.titleBlock} fixed>
          <Text style={styles.mainTitle}>
            {cancelsInvoiceNumber && invoiceNumber === cancelsInvoiceNumber
              ? `Storno-Rechnung ${invoiceNumber} zu Rechnung ${cancelsInvoiceNumber} vom ${format(new Date(cancelsInvoiceDate!), 'dd.MM.yyyy')}`
              : (isCreditNote ? t.creditNoteTitle : (documentType === 'quote' ? t.quoteTitle : t.invoiceTitle)) + ' ' + invoiceNumber
            }
          </Text>
          
          {cancelsInvoiceNumber && invoiceNumber !== cancelsInvoiceNumber && (
            <Text style={{ fontSize: 10, fontStyle: 'italic', marginTop: 5 }}>
              {lang === 'de' 
                ? `Gutschrift zu Rechnung ${cancelsInvoiceNumber} vom ${format(new Date(cancelsInvoiceDate!), 'dd.MM.yyyy')}`
                : `Credit note for invoice ${cancelsInvoiceNumber} dated ${format(new Date(cancelsInvoiceDate!), 'dd.MM.yyyy')}`
              }
            </Text>
          )}
          
          <View style={{ flexDirection: 'row', marginTop: 5, fontSize: 8 }}>
            {paymentMethod && !isCreditNote && (
              <Text style={{ marginRight: 15 }}>{t.paymentMethod}: {paymentMethod}</Text>
            )}
            {dueDate && !isCreditNote && documentType !== 'quote' && (
              <Text>{t.dueDate}: {format(dueDate, 'dd.MM.yyyy')}</Text>
            )}
          </View>

          {taxReason && (
            <View style={styles.taxReasonSection}>
              <Text>{taxReason}</Text>
            </View>
          )}
          {showServiceDateNote && (
            <View style={{ ...styles.taxReasonSection, marginTop: taxReason ? 5 : 10 }}>
              <Text>{t.taxNote}</Text>
            </View>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colPos}>{t.pos}</Text>
            <Text style={styles.colSkuTitle}>{t.sku}</Text>
            <Text style={styles.colMenge}>{t.quantity}</Text>
            <Text style={styles.colTax}>{t.taxRate}</Text>
            <Text style={styles.colPrice}>{t.price}</Text>
            <Text style={styles.colTotal}>{t.total}</Text>
          </View>
          {items.map((item, idx) => (
            <View key={idx} style={styles.tableRow} wrap={false}>
              <Text style={styles.colPos}>{idx + 1}</Text>
              <View style={styles.colSkuTitle}>
                <Text style={styles.bold}>{item.title}</Text>
                {item.sku && (
                  <Text style={{ fontSize: 8 }}>{item.sku}</Text>
                )}
              </View>
              <Text style={styles.colMenge}>{item.quantity}</Text>
              <Text style={styles.colTax}>{Number((item.taxRate * 100).toFixed(2))}%</Text>
              <Text style={styles.colPrice}>{formatPrice(item.unitPrice * factor)}</Text>
              <Text style={styles.colTotal}>{formatPrice(item.unitPrice * item.quantity * factor)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.summarySection} wrap={false}>
          <View style={{ flex: 1, marginRight: 20 }}>
            <View style={{ fontSize: 8 }}>
              {cancelsInvoiceNumber ? null : (customText !== undefined ? (
                customText.split('\n').map((line, i) => (
                  <Text key={i} style={{ marginBottom: 2 }}>{line}</Text>
                ))
              ) : (
                (isCreditNote ? t.thanksCredit : (documentType === 'quote' ? t.thanksQuote : t.thanks)).split('\n').map((line, i) => (
                  <Text key={i} style={{ marginBottom: 2 }}>{line}</Text>
                ))
              ))}
              {skontoRate > 0 && skontoDays > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontWeight: 'bold' }}>
                    {lang === 'de' 
                      ? `Zahlbar innerhalb von ${skontoDays} Tagen abzüglich ${skontoRate}% Skonto (${formatPrice(subtotal * (skontoRate / 100))}) = ${formatPrice(subtotal * (1 - skontoRate / 100))}.`
                      : `Payable within ${skontoDays} days with a ${skontoRate}% discount (${formatPrice(subtotal * (skontoRate / 100))}) = ${formatPrice(subtotal * (1 - skontoRate / 100))}.`
                    }
                  </Text>
                  {dueDate && documentType !== 'quote' && (
                    <Text style={{ marginTop: 2 }}>
                      {lang === 'de'
                        ? `Andernfalls zahlbar bis zum ${format(dueDate, 'dd.MM.yyyy')} ohne Abzug.`
                        : `Otherwise payable until ${format(dueDate, 'dd.MM.yyyy')} without deduction.`
                      }
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
          <View style={styles.summaryTable}>
            <View style={styles.summaryRow}>
              <Text>{t.net}</Text>
              <Text>{formatPrice(rawTotalNet * factor)}</Text>
            </View>
            {discountRate > 0 && (
              <View style={styles.summaryRow}>
                <Text>{lang === 'de' ? `Rabatt (${discountRate}%)` : `Discount (${discountRate}%)`}</Text>
                <Text>-{formatPrice(discountAmount * factor)}</Text>
              </View>
            )}
            {discountRate > 0 && (
              <View style={styles.summaryRow}>
                <Text>{lang === 'de' ? 'Gesamt Netto abzüglich Rabatt' : 'Total Net after discount'}</Text>
                <Text>{formatPrice(totalNet * factor)}</Text>
              </View>
            )}
            {Object.entries(taxesByRate).map(([rate, vals]) => (
              <View key={rate} style={styles.summaryRow}>
                <Text>{t.vat} ({Number((parseFloat(rate) * 100).toFixed(2))}%)</Text>
                <Text>{formatPrice(vals.tax * factor)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text>{t.totalGross}</Text>
              <Text>{formatPrice(subtotal * factor)}</Text>
            </View>
          </View>
        </View>


        {(() => {
          const text = lang === 'de' ? company.footerText : (company.footerTextEn || company.footerText)
          if (!text) return null
          return (
            <View style={styles.footerTextSection} wrap={false}>
              {text.split('\n').map((line, i) => (
                <Text key={i}>{line.trim()}</Text>
              ))}
            </View>
          )
        })()}


        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
          `${t.page} ${pageNumber} / ${totalPages}`
        )} fixed />

        <View style={styles.footer} fixed>
          <View style={styles.footerCol}>
            {company.paymentRecipient && (
              <Text style={styles.footerLine}>{t.paymentRecipient}: {company.paymentRecipient}</Text>
            )}
            {(company.bankName || company.bankIban) && (
              <Text style={styles.footerLine}>
                {t.bankDetails}: {company.bankName} {company.bankBic && `BIC ${company.bankBic}`} {company.bankIban && `, IBAN ${company.bankIban}`}
              </Text>
            )}
          </View>
          <View style={styles.footerCol}>
            {company.management && (
              <Text style={styles.footerLine}>{t.management}: {company.management}</Text>
            )}
          </View>
          <View style={styles.footerCol}>
            {company.registrationCourt && (
              <Text style={styles.footerLine}>{t.regCourt}: {company.registrationCourt}</Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  )
}
