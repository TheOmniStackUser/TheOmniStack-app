import { db } from '../src/db/client'
import { users } from '../src/db/schema/auth'
import { sendVerificationEmail } from '../src/lib/email'

async function testEmail() {
  // Get the first admin user's email from the DB to test with
  const [user] = await db.select().from(users).limit(1)
  
  if (!user || !user.email) {
    console.error('No user found to send test email to.')
    process.exit(1)
  }

  console.log(`Sending test email to: ${user.email}`)
  const result = await sendVerificationEmail(user.email, 'test-token-12345')

  if (result.success) {
    console.log('✅ Email successfully sent via Resend!')
    console.log('Resend Response ID:', result.data?.id)
  } else {
    console.log('❌ Failed to send email.')
    console.error(result.error)
  }

  process.exit(0)
}

testEmail().catch(console.error)
