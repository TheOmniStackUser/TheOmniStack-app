import { db } from '../src/db/client'
import { users } from '../src/db/schema/auth'
import { companies, companyMembers } from '../src/db/schema/companies'
import bcrypt from 'bcryptjs'

async function createTestUser() {
  const email = 'shopify-test@theomnistack.de'
  const password = 'OmniReview2026!'
  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const [user] = await db
      .insert(users)
      .values({
        name: 'Shopify Reviewer',
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        twoFactorEnabled: false
      })
      .returning({ id: users.id })

    const [company] = await db
      .insert(companies)
      .values({
        name: 'Shopify Review Test',
        legalName: 'Shopify Review Test GmbH',
        trialExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days for safety
      })
      .returning({ id: companies.id })

    await db.insert(companyMembers).values({
      userId: user.id,
      companyId: company.id,
      role: 'owner'
    })

    console.log('✅ Test User created successfully!')
    console.log('Email:', email)
    console.log('Password:', password)
  } catch (e) {
    console.error('❌ Error creating test user:', e)
  }
}

createTestUser().then(() => process.exit())
