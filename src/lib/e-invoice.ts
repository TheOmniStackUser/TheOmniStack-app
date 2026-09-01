/**
 * Generates a basic ZUGFeRD 2.1 (Factur-X) XML string.
 * This is a simplified version focusing on the required fields for compliance.
 */
export function generateZugferdXml(data: {
  invoiceNumber: string
  issueDate: Date
  dueDate?: Date | null
  seller: {
    name: string
    vatId?: string
    taxId?: string
    street?: string
    zip?: string
    city?: string
    country: string
    contactName?: string
    contactPhone?: string
    contactEmail?: string
    bankName?: string
    iban?: string
    bic?: string
    paymentRecipient?: string
  }
  buyer: {
    name: string
    street?: string
    zip?: string
    city?: string
    country: string
  }
  items: {
    description: string
    quantity: number
    unitPrice: number
    taxRate: number
  }[]
  currency: string
}) {
  const escapeXml = (unsafe: string | null | undefined) => {
    if (!unsafe) return ''
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;'
        case '>': return '&gt;'
        case '&': return '&amp;'
        case '\'': return '&apos;'
        case '"': return '&quot;'
        default: return c
      }
    })
  }

  const subtotal = data.items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0)
  const totalTax = data.items.reduce((sum, i) => sum + (i.quantity * i.unitPrice * (i.taxRate / 100)), 0)
  const total = subtotal + totalTax

  const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '')

  const taxGroups = data.items.reduce((acc, item) => {
    const rate = item.taxRate;
    if (!acc[rate]) {
      acc[rate] = { basis: 0, tax: 0 };
    }
    acc[rate].basis += item.quantity * item.unitPrice;
    acc[rate].tax += item.quantity * item.unitPrice * (rate / 100);
    return acc;
  }, {} as Record<number, { basis: number, tax: number }>);

  const taxHeaderXml = Object.entries(taxGroups).map(([rate, amounts]) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amounts.tax.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${amounts.basis.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${Number(rate).toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`).join('');

  const renderDueDate = () => {
    if (!data.dueDate) return '';
    const formatted = `${data.dueDate.getDate().toString().padStart(2, '0')}.${(data.dueDate.getMonth() + 1).toString().padStart(2, '0')}.${data.dueDate.getFullYear()}`;
    return `
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>Zahlbar ohne Abzug bis zum ${formatted}</ram:Description>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${formatDate(data.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>`;
  };

  const renderPaymentMeans = () => {
    if (!data.seller.iban) return '';
    return `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode>
        <ram:PayeePartyPaymentFinancialAccount>
          <ram:IBANID>${escapeXml(data.seller.iban)}</ram:IBANID>
          ${data.seller.paymentRecipient ? `<ram:AccountName>${escapeXml(data.seller.paymentRecipient)}</ram:AccountName>` : ''}
        </ram:PayeePartyPaymentFinancialAccount>
        ${data.seller.bic ? `
        <ram:PayeeSpecifiedCredentialPaymentFinancialInstitution>
          <ram:BICID>${escapeXml(data.seller.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCredentialPaymentFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>`;
  };

  const renderContact = () => {
    if (!data.seller.contactName && !data.seller.contactPhone && !data.seller.contactEmail) return '';
    return `
        <ram:DefinedTradeContact>
          ${data.seller.contactName ? `<ram:PersonName>${escapeXml(data.seller.contactName)}</ram:PersonName>` : ''}
          ${data.seller.contactPhone ? `
          <ram:TelephoneUniversalCommunication>
            <ram:CompleteNumber>${escapeXml(data.seller.contactPhone)}</ram:CompleteNumber>
          </ram:TelephoneUniversalCommunication>` : ''}
          ${data.seller.contactEmail ? `
          <ram:EmailURICommunication>
            <ram:URIID>${escapeXml(data.seller.contactEmail)}</ram:URIID>
          </ram:EmailURICommunication>` : ''}
        </ram:DefinedTradeContact>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:a="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:10" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(data.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${formatDate(data.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTransaction>
    ${data.items.map((item, index) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${index + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${escapeXml(item.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${item.unitPrice.toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="H87">${item.quantity.toFixed(4)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${item.taxRate.toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${(item.unitPrice * item.quantity).toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('')}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(data.seller.name)}</ram:Name>${renderContact()}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(data.seller.zip || '')}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(data.seller.street || '')}</ram:LineOne>
          <ram:CityName>${escapeXml(data.seller.city || '')}</ram:CityName>
          <ram:CountryID>${escapeXml(data.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${data.seller.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${escapeXml(data.seller.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(data.buyer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(data.buyer.zip || '')}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(data.buyer.street || '')}</ram:LineOne>
          <ram:CityName>${escapeXml(data.buyer.city || '')}</ram:CityName>
          <ram:CountryID>${escapeXml(data.buyer.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${formatDate(data.issueDate)}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(data.currency)}</ram:InvoiceCurrencyCode>${renderPaymentMeans()}
${taxHeaderXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${subtotal.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${subtotal.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escapeXml(data.currency)}">${totalTax.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${total.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${total.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${renderDueDate()}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTransaction>
</rsm:CrossIndustryInvoice>`
}

