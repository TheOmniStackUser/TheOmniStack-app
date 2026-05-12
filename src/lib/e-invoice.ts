/**
 * Generates a basic ZUGFeRD 2.1 (Factur-X) XML string.
 * This is a simplified version focusing on the required fields for compliance.
 */
export function generateZugferdXml(data: {
  invoiceNumber: string
  issueDate: Date
  seller: {
    name: string
    vatId?: string
    taxId?: string
    street?: string
    zip?: string
    city?: string
    country: string
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
  const subtotal = data.items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0)
  const totalTax = data.items.reduce((sum, i) => sum + (i.quantity * i.unitPrice * (i.taxRate / 100)), 0)
  const total = subtotal + totalTax

  const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:a="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:10" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${data.invoiceNumber}</ram:ID>
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
        <ram:Name>${item.description}</ram:Name>
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
        <ram:Name>${data.seller.name}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${data.seller.zip || ''}</ram:PostcodeCode>
          <ram:LineOne>${data.seller.street || ''}</ram:LineOne>
          <ram:CityName>${data.seller.city || ''}</ram:CityName>
          <ram:CountryID>${data.seller.country}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${data.seller.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${data.seller.vatId}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${data.buyer.name}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${data.buyer.zip || ''}</ram:PostcodeCode>
          <ram:LineOne>${data.buyer.street || ''}</ram:LineOne>
          <ram:CityName>${data.buyer.city || ''}</ram:CityName>
          <ram:CountryID>${data.buyer.country}</ram:CountryID>
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
      <ram:InvoiceCurrencyCode>${data.currency}</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${totalTax.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${subtotal.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${subtotal.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${subtotal.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${data.currency}">${totalTax.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${total.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${total.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTransaction>
</rsm:CrossIndustryInvoice>`
}
