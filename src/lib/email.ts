import { Resend } from 'resend'
import { VerificationEmail } from '@/emails/VerificationEmail'
import { InvitationEmail } from '@/emails/InvitationEmail'
import { CompanyEmailVerificationEmail } from '@/emails/CompanyEmailVerificationEmail'

// Initialize Resend. 
// If no API key is provided (e.g. in local dev), it won't crash but sending will fail.
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder')

// Standard sender address once the domain is verified.
const DEFAULT_SENDER = 'TheOmniStack Team <noreply@theomnistack.de>'

export async function sendVerificationEmail(toEmail: string, token: string) {
  try {
    // Generate the full verify link based on the current environment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const verifyLink = `${baseUrl}/register/verify?token=${token}`

    const { data, error } = await resend.emails.send({
      from: DEFAULT_SENDER,
      to: [toEmail],
      subject: 'Willkommen bei TheOmniStack – Bitte E-Mail bestätigen',
      react: VerificationEmail({ verifyLink }),
    })

    if (error) {
      console.error('[Email Service] Error sending verification email:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('[Email Service] Fatal error sending verification email:', error)
    return { success: false, error }
  }
}

export async function sendInvitationEmail(toEmail: string, inviterName: string, companyName: string, token: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteLink = `${baseUrl}/invite?token=${token}`

    const { data, error } = await resend.emails.send({
      from: DEFAULT_SENDER,
      to: [toEmail],
      subject: `Du wurdest in das Team "${companyName}" eingeladen`,
      react: InvitationEmail({ inviterName, companyName, inviteLink }),
    })

    if (error) {
      console.error('[Email Service] Error sending invitation email:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('[Email Service] Fatal error sending invitation email:', error)
    return { success: false, error }
  }
}

export async function sendInvoiceEmail({
  toEmail,
  ccEmail,
  replyTo,
  subject,
  html,
  pdfBuffer,
  pdfFilename,
  smtpConfig
}: {
  toEmail: string
  ccEmail?: string
  replyTo: string
  subject: string
  html: string
  pdfBuffer?: Buffer
  pdfFilename?: string
  smtpConfig?: {
    host?: string
    port?: number
    username?: string
    password?: string
    encryption?: 'ssl' | 'tls' | 'none'
    fromEmail?: string
    fromName?: string
  }
}) {
  try {
    if (smtpConfig && smtpConfig.host && smtpConfig.fromEmail) {
      const nodemailer = await import('nodemailer')
      const secure = smtpConfig.encryption === 'ssl' || smtpConfig.port === 465

      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 587,
        secure,
        auth: smtpConfig.username && smtpConfig.password ? {
          user: smtpConfig.username,
          pass: smtpConfig.password,
        } : undefined,
        tls: {
          rejectUnauthorized: false
        }
      })

      const attachments = pdfBuffer && pdfFilename ? [
        {
          filename: pdfFilename,
          content: pdfBuffer,
        }
      ] : undefined

      const from = smtpConfig.fromName 
        ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>` 
        : smtpConfig.fromEmail

      const info = await transporter.sendMail({
        from,
        to: toEmail,
        cc: ccEmail,
        replyTo: replyTo || undefined,
        subject: subject,
        html: html.replace(/\n/g, '<br />'),
        attachments,
      })

      return { success: true, data: info }
    } else {
      const attachments = pdfBuffer && pdfFilename ? [
        {
          filename: pdfFilename,
          content: pdfBuffer.toString('base64'),
        }
      ] : undefined

      const { data, error } = await resend.emails.send({
        from: DEFAULT_SENDER,
        to: [toEmail],
        cc: ccEmail ? [ccEmail] : undefined,
        replyTo: replyTo,
        subject: subject,
        html: html.replace(/\n/g, '<br />'),
        attachments,
      })

      if (error) {
        console.error('[Email Service] Error sending invoice email:', error)
        return { success: false, error }
      }

      return { success: true, data }
    }
  } catch (error) {
    console.error('[Email Service] Fatal error sending invoice email:', error)
    return { success: false, error }
  }
}

export async function sendCompanyEmailVerificationEmail(toEmail: string, companyName: string, token: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const verifyLink = `${baseUrl}/settings/verify-email?token=${token}`

    const { data, error } = await resend.emails.send({
      from: DEFAULT_SENDER,
      to: [toEmail],
      subject: `Bestätige die neue E-Mail-Adresse für ${companyName}`,
      react: CompanyEmailVerificationEmail({ companyName, verifyLink }),
    })

    if (error) {
      console.error('[Email Service] Error sending company verification email:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('[Email Service] Fatal error sending company verification email:', error)
    return { success: false, error }
  }
}

