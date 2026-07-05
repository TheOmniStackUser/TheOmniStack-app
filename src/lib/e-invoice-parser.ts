import { XMLParser } from 'fast-xml-parser'

export interface ParsedInvoiceData {
  invoiceNumber: string
  issueDate?: string
  supplierName: string
  supplierVatId?: string
  supplierEmail?: string
  supplierIban?: string
  supplierBic?: string
  currency: string
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
}

/**
 * Parses a ZUGFeRD or XRechnung XML string.
 * Supports both CII (Cross Industry Invoice) and UBL (Universal Business Language).
 */
export function parseEInvoiceXml(xmlContent: string): ParsedInvoiceData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  })

  const doc = parser.parse(xmlContent)

  if (doc.CrossIndustryInvoice) {
    return parseCII(doc.CrossIndustryInvoice)
  } else if (doc.Invoice) {
    // UBL Format
    return parseUBL(doc.Invoice)
  }

  throw new Error('Unbekanntes E-Rechnungsformat (weder CII noch UBL gefunden).')
}

function parseCII(cii: any): ParsedInvoiceData {
  // Navigation through the CII structure
  const document = cii.ExchangedDocument || {}
  const transaction = cii.SupplyChainTradeTransaction || {}
  const agreement = transaction.ApplicableHeaderTradeAgreement || {}
  const settlement = transaction.ApplicableHeaderTradeSettlement || {}
  
  const seller = agreement.SellerTradeParty || {}
  const sellerTax = Array.isArray(seller.SpecifiedTaxRegistration) 
    ? seller.SpecifiedTaxRegistration[0] 
    : seller.SpecifiedTaxRegistration
  
  const paymentMeans = Array.isArray(settlement.SpecifiedTradeSettlementPaymentMeans)
    ? settlement.SpecifiedTradeSettlementPaymentMeans[0]
    : settlement.SpecifiedTradeSettlementPaymentMeans
  const payeeAccount = paymentMeans?.PayeePartyCreditorFinancialAccount || {}
  const payeeInstitution = paymentMeans?.PayeeSpecifiedCreditorFinancialInstitution || {}

  const summation = settlement.SpecifiedTradeSettlementHeaderMonetarySummation || {}

  // Some fields might be objects with '#text' or directly the value depending on XML structure
  const getValue = (field: any) => typeof field === 'object' && field !== null ? field['#text'] || field[''] : field

  const parseDate = (dateField: any) => {
    const dateStr = getValue(dateField?.DateTimeString)
    if (!dateStr) return undefined
    // Often in YYYYMMDD format
    if (dateStr.length === 8) {
      return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}T00:00:00Z`
    }
    return dateStr
  }

  return {
    invoiceNumber: getValue(document.ID) || 'UNKNOWN',
    issueDate: parseDate(document.IssueDateTime),
    supplierName: getValue(seller.Name) || 'Unbekannter Lieferant',
    supplierVatId: getValue(sellerTax?.ID),
    supplierEmail: getValue(seller.URIUniversalCommunication?.URIID),
    supplierIban: getValue(payeeAccount.ProprietaryID) || getValue(payeeAccount.IBANID),
    supplierBic: getValue(payeeInstitution.BICID),
    currency: getValue(settlement.InvoiceCurrencyCode) || 'EUR',
    subtotalAmount: parseFloat(getValue(summation.TaxBasisTotalAmount) || '0'),
    taxAmount: parseFloat(getValue(summation.TaxTotalAmount) || '0'),
    totalAmount: parseFloat(getValue(summation.GrandTotalAmount) || '0'),
  }
}

function parseUBL(ubl: any): ParsedInvoiceData {
  const getValue = (field: any) => typeof field === 'object' && field !== null ? field['#text'] || field[''] : field
  
  const supplier = ubl.AccountingSupplierParty?.Party || {}
  const taxScheme = supplier.PartyTaxScheme || {}
  const legalEntity = supplier.PartyLegalEntity || {}
  
  const paymentMeans = Array.isArray(ubl.PaymentMeans) ? ubl.PaymentMeans[0] : ubl.PaymentMeans
  const financialAccount = paymentMeans?.PayeeFinancialAccount || {}
  
  const monetaryTotal = ubl.LegalMonetaryTotal || {}

  return {
    invoiceNumber: getValue(ubl.ID) || 'UNKNOWN',
    issueDate: getValue(ubl.IssueDate) ? `${getValue(ubl.IssueDate)}T00:00:00Z` : undefined,
    supplierName: getValue(legalEntity.RegistrationName) || getValue(supplier.PartyName?.Name) || 'Unbekannter Lieferant',
    supplierVatId: getValue(taxScheme.CompanyID),
    supplierEmail: getValue(supplier.Contact?.ElectronicMail),
    supplierIban: getValue(financialAccount.ID),
    supplierBic: getValue(financialAccount.FinancialInstitutionBranch?.ID),
    currency: getValue(ubl.DocumentCurrencyCode) || 'EUR',
    subtotalAmount: parseFloat(getValue(monetaryTotal.TaxExclusiveAmount) || '0'),
    taxAmount: parseFloat(getValue(ubl.TaxTotal?.TaxAmount) || '0'),
    totalAmount: parseFloat(getValue(monetaryTotal.TaxInclusiveAmount) || '0'),
  }
}
