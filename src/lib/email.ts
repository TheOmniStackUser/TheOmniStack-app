import { Resend } from 'resend'
import { VerificationEmail } from '@/emails/VerificationEmail'
import { InvitationEmail } from '@/emails/InvitationEmail'

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
