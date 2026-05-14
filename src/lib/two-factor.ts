import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { db } from '@/db/client'
import { users } from '@/db/schema/auth'
import { eq } from 'drizzle-orm'

/**
 * Generate a new TOTP secret for a user.
 */
export function generateTwoFactorSecret() {
  return authenticator.generateSecret()
}

/**
 * Generate a TOTP URL for a QR code.
 */
export function getTwoFactorUrl(email: string, secret: string) {
  return authenticator.keyuri(email, 'TheOmniStack', secret)
}

/**
 * Generate a QR code data URL.
 */
export async function generateQrCode(url: string) {
  return QRCode.toDataURL(url)
}

/**
 * Verify a TOTP code against a secret.
 */
export function verifyTwoFactorToken(token: string, secret: string) {
  return authenticator.verify({ 
    token, 
    secret,
    window: 1 // Allow +/- 1 interval (30 seconds) drift
  })
}

/**
 * Enable two-factor authentication for a user.
 */
export async function enableTwoFactor(userId: string, secret: string) {
  await db
    .update(users)
    .set({
      twoFactorSecret: secret,
      twoFactorEnabled: true,
    })
    .where(eq(users.id, userId))
}

/**
 * Disable two-factor authentication for a user.
 */
export async function disableTwoFactor(userId: string) {
  await db
    .update(users)
    .set({
      twoFactorSecret: null,
      twoFactorEnabled: false,
    })
    .where(eq(users.id, userId))
}
