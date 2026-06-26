import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { users, pendingRegistrations } from '@/db/schema/auth'
import { companies, companyMembers } from '@/db/schema/companies'
import { createSession } from '@/lib/session'
import { eq, and, gt } from 'drizzle-orm'
import crypto from 'crypto'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${url.protocol}//${url.host}/login?error=${error}`)
  }

  if (!code) {
    return NextResponse.redirect(`${url.protocol}//${url.host}/login?error=No+code+provided`)
  }

  // Optional: Verify state from cookie to prevent CSRF
  // const savedState = request.headers.get('cookie')?.match(/oauth_state=([^;]+)/)?.[1]
  // if (!state || state !== savedState) {
  //   return NextResponse.redirect(`${url.protocol}//${url.host}/login?error=Invalid+state`)
  // }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${url.protocol}//${url.host}/api/auth/callback/google`

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${url.protocol}//${url.host}/login?error=Google+OAuth+not+configured`)
  }

  try {
    // 1. Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Failed to exchange code:', errorData)
      return NextResponse.redirect(`${url.protocol}//${url.host}/login?error=Failed+to+exchange+token`)
    }

    const tokens = await tokenResponse.json()

    // 2. Fetch user profile
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!profileResponse.ok) {
      return NextResponse.redirect(`${url.protocol}//${url.host}/login?error=Failed+to+fetch+profile`)
    }

    const profile = await profileResponse.json()
    const { id: googleId, email, name } = profile

    if (!email) {
      return NextResponse.redirect(`${url.protocol}//${url.host}/login?error=No+email+from+Google`)
    }

    // 3. Find existing user
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    let userId = user?.id
    let companyId: string | null = null

    if (user) {
      // Update googleId if not set
      if (!user.googleId) {
        await db.update(users).set({ googleId }).where(eq(users.id, user.id))
      }
      // Log them in (find their company)
      const [membership] = await db
        .select({ companyId: companyMembers.companyId })
        .from(companyMembers)
        .where(eq(companyMembers.userId, user.id))
        .limit(1)
      companyId = membership?.companyId ?? null
    } else {
      // 4. Register new user
      await db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({
            email: email.toLowerCase(),
            name: name || 'Google User',
            googleId,
            passwordHash: null,
            emailVerifiedAt: new Date(),
          })
          .returning({ id: users.id })

        const [company] = await tx
          .insert(companies)
          .values({
            name: `${name || 'Google User'} Company`,
            legalName: name || 'Google User',
            trialExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          })
          .returning({ id: companies.id })

        await tx.insert(companyMembers).values({
          userId: newUser.id,
          companyId: company.id,
          role: 'owner',
        })

        userId = newUser.id
        companyId = company.id
      })
    }

    if (!userId) {
      throw new Error('Failed to create or find user')
    }

    // 5. Create Session
    await createSession(userId, companyId)

    // Clear state cookie
    const response = NextResponse.redirect(`${url.protocol}//${url.host}/dashboard`)
    response.cookies.delete('oauth_state')
    
    return response

  } catch (err) {
    console.error('Google OAuth error:', err)
    return NextResponse.redirect(`${url.protocol}//${url.host}/login?error=Internal+Server+Error`)
  }
}
