'use server'

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder')

export async function submitWiderruf(prevState: any, formData: FormData) {
  try {
    const name = formData.get('name') as string
    const orderNumber = formData.get('orderNumber') as string
    const dateOfOrder = formData.get('dateOfOrder') as string
    const email = formData.get('email') as string
    const details = formData.get('details') as string

    if (!name || !orderNumber || !email) {
      return { success: false, message: 'Bitte füllen Sie alle Pflichtfelder aus.' }
    }

    const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })

    // E-Mail an den Kunden (Eingangsbestätigung)
    const customerHtml = `
      <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; padding: 24px;">
        <h2 style="color: #0f172a; margin-top: 0;">Eingangsbestätigung Widerruf</h2>
        <p>Hallo ${name},</p>
        <p>hiermit bestätigen wir den Eingang Ihrer Widerrufserklärung (gemäß § 356a BGB).</p>
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 24px 0;">
          <p style="margin: 0 0 8px;"><strong>Bestellnummer:</strong> ${orderNumber}</p>
          <p style="margin: 0 0 8px;"><strong>Datum der Bestellung:</strong> ${dateOfOrder || '-'}</p>
          <p style="margin: 0 0 8px;"><strong>Zeitpunkt des Widerrufs:</strong> ${timestamp}</p>
          <p style="margin: 0;"><strong>Ergänzende Angaben:</strong> ${details || '-'}</p>
        </div>
        <p>Wir werden Ihr Anliegen schnellstmöglich prüfen und uns bei Bedarf mit Ihnen in Verbindung setzen.</p>
        <br/>
        <p style="margin: 0;">Viele Grüße,</p>
        <p style="margin: 0;"><strong>Ihr Peroyork-Team</strong></p>
      </div>
    `

    // E-Mail an den Shopbetreiber
    const adminHtml = `
      <div style="font-family: sans-serif; color: #333;">
        <h2>Neuer Widerruf eingegangen</h2>
        <p>Ein Kunde hat soeben das Widerrufsformular ausgefüllt:</p>
        <ul>
          <li><strong>Name:</strong> ${name}</li>
          <li><strong>E-Mail:</strong> ${email}</li>
          <li><strong>Bestellnummer:</strong> ${orderNumber}</li>
          <li><strong>Datum der Bestellung:</strong> ${dateOfOrder || '-'}</li>
          <li><strong>Zeitpunkt:</strong> ${timestamp}</li>
          <li><strong>Ergänzende Angaben:</strong> ${details || '-'}</li>
        </ul>
      </div>
    `

    const senderEmail = 'info@peroyork.de'

    // 1. E-Mail an den Kunden senden
    const { error: customerError } = await resend.emails.send({
      from: `Peroyork <${senderEmail}>`,
      to: [email],
      subject: 'Eingangsbestätigung Ihres Widerrufs',
      html: customerHtml,
      replyTo: senderEmail
    })

    if (customerError) {
      console.error('[Widerruf Action] Error sending customer email:', customerError)
      return { success: false, message: 'Fehler beim Senden der Bestätigungs-E-Mail.' }
    }

    // 2. E-Mail an info@peroyork.de senden
    const { error: adminError } = await resend.emails.send({
      from: `Peroyork System <${senderEmail}>`,
      to: [senderEmail],
      subject: `Neuer Widerruf: Bestellung ${orderNumber}`,
      html: adminHtml,
      replyTo: email // So kann direkt auf die E-Mail geantwortet werden
    })

    if (adminError) {
      console.error('[Widerruf Action] Error sending admin email:', adminError)
    }

    return { 
      success: true, 
      message: 'Widerruf erfolgreich übermittelt.',
      data: { name, orderNumber, timestamp }
    }
  } catch (error) {
    console.error('[Widerruf Action] Fatal error:', error)
    return { success: false, message: 'Ein unerwarteter Fehler ist aufgetreten.' }
  }
}
