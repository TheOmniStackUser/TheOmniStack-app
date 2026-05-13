import { HermesAdapter } from '../src/adapters/shipping/hermes'
import fs from 'fs'

async function generateTestLabel() {
  console.log('Initialize Hermes Adapter...')
  // Using default constructor creates test credentials for testkunde3
  const adapter = new HermesAdapter()

  const mockOrder = {
    id: 'TEST-ORDER-12345',
    shippingName: 'Heinrich, Reiner',
    shippingStreet: 'Lisztstr. 1',
    shippingZip: '73553',
    shippingCity: 'Alfdorf',
    shippingCountry: 'DE',
    totalWeight: 2.5
  }

  const mockCompany = {
    name: 'Versand Test F&L Fashion GmbH',
    warehouseStreet: 'Zöpfstrasse 4',
    warehouseZip: '82405',
    warehouseCity: 'Wessobrunn'
  }

  try {
    const { labelUrl, trackingNumber } = await adapter.generateLabelForOrder(mockOrder, mockCompany, 'XL')
    console.log('Successfully generated label!')
    console.log('Tracking Number:', trackingNumber)
    
    // labelUrl is data:application/pdf;base64,...
    const base64Data = labelUrl.replace(/^data:application\/pdf;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    
    const outputPath = 'Hermes_Testlabel_TheOmniStack.pdf'
    fs.writeFileSync(outputPath, buffer)
    console.log(`Saved PDF to: ${outputPath}`)
    
  } catch (error) {
    console.error('Failed to generate label:', error)
  }
  
  process.exit(0)
}

generateTestLabel()
