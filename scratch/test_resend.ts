import { Resend } from 'resend'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const apiKey = process.env.RESEND_API_KEY
console.log('Using Resend API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'None')

const resend = new Resend(apiKey || 're_placeholder')

async function testSend() {
  try {
    const { data, error } = await resend.emails.send({
      from: 'TheOmniStack Team <noreply@theomnistack.de>',
      to: ['leis@guggen-mountain.com'],
      subject: 'TheOmniStack Resend-Test',
      html: '<p>Dieser Test prüft die Resend-Konfiguration.</p>',
    })

    if (error) {
      console.error('Resend returned an error:', JSON.stringify(error, null, 2))
    } else {
      console.log('Resend success! Data:', JSON.stringify(data, null, 2))
    }
  } catch (err) {
    console.error('Fatal error trying to send test email:', err)
  }
}

testSend()
