import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { companies, companyMembers } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'

export interface GrokAuthContext {
  companyId: string
  userId: string | null
  role: string
  companyName: string
}

export type AuthResult =
  | { success: true; auth: GrokAuthContext }
  | { success: false; response: NextResponse }

export function extractApiKey(req: Request): string | null {
  // 1. Check Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/)
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1]
    }
    if (parts.length === 1 && !parts[0].toLowerCase().startsWith('bearer')) {
      return parts[0]
    }
  }

  // 2. Check x-api-key
  const xApiKey = req.headers.get('x-api-key') || req.headers.get('X-Api-Key')
  if (xApiKey && xApiKey.trim()) {
    return xApiKey.trim()
  }

  // 3. Optional URL query parameter fallback (?api_key=...)
  try {
    const url = new URL(req.url)
    const paramKey = url.searchParams.get('api_key') || url.searchParams.get('apiKey')
    if (paramKey && paramKey.trim()) {
      return paramKey.trim()
    }
  } catch {
    // ignore
  }

  return null
}

export async function authenticateGrokRequest(req: Request): Promise<AuthResult> {
  const apiKey = extractApiKey(req)

  if (!apiKey) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Unauthorized: Missing API Key',
          message:
            'Please provide your OmniStack API key via "Authorization: Bearer <key>" or "x-api-key: <key>" header.',
        },
        { status: 401 }
      ),
    }
  }

  // 1. Look up personal API key in companyMembers
  const [member] = await db
    .select({
      companyId: companyMembers.companyId,
      userId: companyMembers.userId,
      role: companyMembers.role,
    })
    .from(companyMembers)
    .where(eq(companyMembers.apiKey, apiKey))
    .limit(1)

  if (member) {
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, member.companyId))
      .limit(1)

    return {
      success: true,
      auth: {
        companyId: member.companyId,
        userId: member.userId,
        role: member.role,
        companyName: company?.name || 'OmniStack Tenant',
      },
    }
  }

  // 2. Fallback: check company-level API key
  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.apiKey, apiKey))
    .limit(1)

  if (company) {
    return {
      success: true,
      auth: {
        companyId: company.id,
        userId: null,
        role: 'owner',
        companyName: company.name,
      },
    }
  }

  return {
    success: false,
    response: NextResponse.json(
      {
        error: 'Unauthorized: Invalid API Key',
        message: 'The provided API key does not match any active company or user account.',
      },
      { status: 401 }
    ),
  }
}
