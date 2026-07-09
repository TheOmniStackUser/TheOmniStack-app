import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer'
import { format } from 'date-fns'

// Optional: Register a custom font if you want something specific, standard Helvetica is usually fine

const styles = StyleSheet.create({
  page: {
    padding: '40px 50px',
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  logo: {
    height: 60,
    objectFit: 'contain',
  },
  companyLine: {
    fontSize: 8,
    borderBottom: '1px solid #000',
    paddingBottom: 2,
    marginBottom: 10,
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  addressBlock: {
    width: '45%',
  },
  contactBlock: {
    width: '45%',
  },
  contactRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  contactLabel: {
    width: 80,
  },
  contactValue: {},
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  infoBlock: {
    marginTop: 20,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  infoLabel: {
    width: 80,
  },
  infoValue: {
    fontFamily: 'Helvetica-Bold',
  },
  titleBlock: {
    marginTop: 30,
    marginBottom: 10,
  },
  titleLine: {
    fontSize: 9,
    marginBottom: 10,
  },
  mainTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  table: {
    marginTop: 10,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1px solid #000',
    paddingBottom: 4,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  colMenge: { width: '10%' },
  colArtNr: { width: '35%', paddingRight: 10 },
  colBez: { width: '45%', paddingRight: 10 },
  colPos: { width: '10%', textAlign: 'right' },
  footerTextSection: {
    marginTop: 30,
    fontSize: 9,
    lineHeight: 1.4,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 80,
    right: 50,
    fontSize: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6,
    borderTop: '1px solid #ccc',
    paddingTop: 5,
  },
  footerCol: {
    width: '30%',
  },
  footerLine: {
    marginBottom: 1,
  }
})

interface DeliveryNoteProps {
  order: any
  company: any
}

// Internal component for a single delivery note page
function DeliveryNotePage({ order, company }: DeliveryNoteProps) {
  const countryCode = (order.shippingCountry || '').toUpperCase()
  const isGerman = countryCode === 'DE' || countryCode === 'DEU' || countryCode === 'GERMANY' || countryCode === 'DEUTSCHLAND'
  const lang = !isGerman ? (company.internationalLanguage || 'en') : 'de'

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
    return code // Fallback to code if not in list
  }

  const shippingCountryFull = getCountryName(countryCode, lang)

  const getDisplayOrderId = () => {
    const raw = order.rawPayload as any
    if (!raw) return order.marketplaceOrderId

    // Marketplace specific display IDs
    if (order.marketplace === 'otto') {
      return raw.orderNumber || raw.salesOrderId || order.marketplaceOrderId
    }
    if (order.marketplace === 'shopify') {
      return raw.name || raw.order_number?.toString() || order.marketplaceOrderId
    }
    if (order.marketplace?.startsWith('mirakl_')) {
      return raw.display_id || order.marketplaceOrderId
    }
    
    if (order.marketplace === 'manual') {
      return raw.manualMetadata?.orderNumber || undefined
    }
    
    return order.marketplaceOrderId
  }

  const displayOrderId = getDisplayOrderId()

  const t = {
    de: {
      contactTitle: 'So erreichen Sie uns',
      internet: 'Internet',
      email: 'E-Mail',
      phone: 'Telefon',
      taxId: 'Steuer-Nr.',
      vatId: 'USt-IdNr.',
      date: 'Datum',
      customerNr: 'Kundennr.',
      orderNr: process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Auftragsnr.' : 'Bestellnr.',
      deliveryNote: 'Lieferschein',
      orderTitle: process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Ihr Auftrag Nr.' : 'Ihre Bestellung Nr.',
      from: 'vom',
      mainTitle: 'Lieferschein / Rücksendeschein',
      quantity: 'Menge',
      sku: 'Art-Nr.',
      title: 'Bezeichnung',
      pos: 'Pos',
      shipping: 'Standardversand',
      thanks: process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Vielen Dank für Ihren Auftrag.' : 'Vielen Dank für Ihre Bestellung.',
      paidOn: process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Ihr Auftrag wurde am {date} bezahlt.' : 'Ihre Bestellung wurde am {date} bezahlt.',
      page: 'Seite',
      paymentRecipient: 'Zahlungsempfänger',
      bankDetails: 'Bankverbindung',
      management: 'Geschäftsführung',
      regCourt: 'Registergericht/Nr.'
    },
    en: {
      contactTitle: 'How to reach us',
      internet: 'Web',
      email: 'Email',
      phone: 'Phone',
      taxId: 'Tax ID',
      vatId: 'VAT ID',
      date: 'Date',
      customerNr: 'Customer No.',
      orderNr: 'Order No.',
      deliveryNote: 'Delivery Note',
      orderTitle: 'Your Order No.',
      from: 'from',
      mainTitle: 'Delivery Note / Return Form',
      quantity: 'Qty',
      sku: 'SKU',
      title: 'Description',
      pos: 'Pos',
      shipping: 'Standard Shipping',
      thanks: 'Thank you for your order.',
      paidOn: 'Your order was paid on {date}.',
      page: 'Page',
      paymentRecipient: 'Payment Recipient',
      bankDetails: 'Bank Details',
      management: 'Management',
      regCourt: 'Registration'
    }
  }[lang as 'de' | 'en']

  const currentDate = format(new Date(), 'dd.MM.yyyy')
  const orderDate = order.marketplacePurchaseDate ? format(new Date(order.marketplacePurchaseDate), 'dd.MM.yyyy') : currentDate
  const companyShortLine = `${company.name} - ${company.street} - ${company.zip} ${company.city}`
  const items = Array.isArray(order.items) ? order.items : []
  const footerText = lang === 'en' ? company.deliveryNoteFooterEn : company.deliveryNoteFooter

  return (
    <Page size="A4" style={styles.page}>
      {/* Logo repeated on every page */}
      <View style={styles.header} fixed>
        {company.logoUrl ? (
          <Image src={company.logoUrl} style={styles.logo} />
        ) : (
          <Text style={{ fontSize: 24, fontFamily: 'Helvetica-Bold' }}>{company.name}</Text>
        )}
      </View>

      <View style={styles.topSection}>
        <View style={styles.addressBlock}>
          <Text style={styles.companyLine}>{companyShortLine}</Text>
          {order.shippingCompany && <Text style={styles.bold}>{order.shippingCompany}</Text>}
          {order.shippingAddressAddition && <Text style={styles.bold}>{order.shippingAddressAddition}</Text>}
          <Text style={styles.bold}>{order.shippingName}</Text>
          <Text style={styles.bold}>{order.shippingStreet}</Text>
          <Text style={styles.bold}>{order.shippingZip} {order.shippingCity}</Text>
          <Text style={styles.bold}>{shippingCountryFull}</Text>
          {order.shippingPhone && <Text style={{ ...styles.bold, marginTop: 5 }}>Tel: {order.shippingPhone}</Text>}
        </View>

        <View style={styles.contactBlock}>
          <Text style={[styles.bold, { borderBottom: '1px solid #000', paddingBottom: 2, marginBottom: 5 }]}>
            {t.contactTitle}
          </Text>
          {company.website && (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>{t.internet}</Text>
              <Text style={styles.contactValue}>{company.website}</Text>
            </View>
          )}
          {company.email && (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>{t.email}</Text>
              <Text style={styles.contactValue}>{company.email}</Text>
            </View>
          )}
          {company.phone && (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>{t.phone}</Text>
              <Text style={styles.contactValue}>{company.phone}</Text>
            </View>
          )}
          <View style={{ marginTop: 10 }}>
            {company.taxId && (
              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>{t.taxId}</Text>
                <Text style={[styles.contactValue, styles.bold]}>{company.taxId}</Text>
              </View>
            )}
            {company.vatId && (
              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>{t.vatId}</Text>
                <Text style={[styles.contactValue, styles.bold]}>{company.vatId}</Text>
              </View>
            )}
          </View>

          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t.date}</Text>
              <Text style={styles.infoValue}>{currentDate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t.customerNr}</Text>
              <Text style={styles.infoValue}>{order.customerNumber || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t.orderNr}</Text>
              <Text style={styles.infoValue}>{displayOrderId || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t.deliveryNote}</Text>
              <Text style={styles.infoValue}>{order.deliveryNoteNumber || '-'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.titleBlock} fixed>
        <Text style={styles.titleLine}>{t.orderTitle} {displayOrderId} {t.from} {orderDate}</Text>
        <Text style={styles.mainTitle}>{t.mainTitle} {order.deliveryNoteNumber}</Text>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.colMenge}>{t.quantity}</Text>
          <Text style={styles.colArtNr}>{t.sku}</Text>
          <Text style={styles.colBez}>{t.title}</Text>
          <Text style={styles.colPos}>{t.pos}</Text>
        </View>
        {items.map((item: any, idx: number) => (
          <View key={idx} style={styles.tableRow}>
            <Text style={styles.colMenge}>{item.quantity}</Text>
            <Text style={styles.colArtNr}>{item.sku}</Text>
            <Text style={styles.colBez}>{item.title}</Text>
            <Text style={styles.colPos}>{idx + 1}</Text>
          </View>
        ))}
        <View style={styles.tableRow}>
          <Text style={styles.colMenge}>1</Text>
          <Text style={styles.colArtNr}></Text>
          <Text style={styles.colBez}>{t.shipping} {order.shippingCountry}</Text>
          <Text style={styles.colPos}>{items.length + 1}</Text>
        </View>
      </View>

      <View style={styles.footerTextSection} wrap={false}>
        <Text style={{ marginBottom: 10 }}>{t.thanks}</Text>
        <Text style={{ marginBottom: 15 }}>{t.paidOn.replace('{date}', orderDate)}</Text>
        {footerText && (
          <View style={{ marginTop: 10 }}>
            {footerText.split('\n').map((line: string, i: number) => (
              <Text key={i}>{line.trim()}</Text>
            ))}
          </View>
        )}
      </View>

      <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
        `${t.page} ${pageNumber} / ${totalPages}`
      )} fixed />

      <View style={styles.footer} fixed>
        <View style={styles.footerCol}>
          {company.paymentRecipient && (
            <Text style={styles.footerLine}>{t.paymentRecipient}: {company.paymentRecipient}</Text>
          )}
          {(company.bankName || company.iban) && (
            <Text style={styles.footerLine}>
              {t.bankDetails}: {company.bankName} {company.bic && `BIC ${company.bic}`} {company.iban && `, IBAN ${company.iban}`}
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
  )
}

export function DeliveryNoteDocument({ order, company }: DeliveryNoteProps) {
  return (
    <Document>
      <DeliveryNotePage order={order} company={company} />
    </Document>
  )
}

export function BulkDeliveryNoteDocument({ orders, company }: { orders: any[], company: any }) {
  return (
    <Document>
      {orders.map((order) => (
        <DeliveryNotePage key={order.id} order={order} company={company} />
      ))}
    </Document>
  )
}
