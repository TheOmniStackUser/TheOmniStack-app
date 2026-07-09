import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companyMembers, companies } from '@/db/schema/companies'
import { users, verificationTokens } from '@/db/schema/auth'
import { orders } from '@/db/schema/orders'
import { invoices } from '@/db/schema/invoices'
import { eq, gt, gte, lt, and, count } from 'drizzle-orm'
import { UserList } from './user-list'

export default async function UserManagementPage() {
  const auth = await requireAuth()

  const [members, tokens, company] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: companyMembers.role,
        joinedAt: companyMembers.joinedAt,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(companyMembers)
      .innerJoin(users, eq(companyMembers.userId, users.id))
      .where(eq(companyMembers.companyId, auth.activeCompanyId)),
    db
      .select({
        identifier: verificationTokens.identifier,
        token: verificationTokens.token,
      })
      .from(verificationTokens)
      .where(gt(verificationTokens.expiresAt, new Date())),
    db
      .select({
        trialExpiresAt: companies.trialExpiresAt,
        canceledAt: companies.canceledAt,
        cancelEffectiveDate: companies.cancelEffectiveDate,
        createdAt: companies.createdAt,
        registeredApp: companies.registeredApp,
      })
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)
      .then(res => res[0])
  ])

  const enrichedMembers = members.map((m) => {
    const matchingToken = tokens.find(
      (t) => t.identifier.toLowerCase() === m.email.toLowerCase()
    )
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
      isPending: !m.emailVerifiedAt,
      inviteToken: matchingToken ? matchingToken.token : null,
    }
  })

  const now = new Date();
  const anchorDate = company.trialExpiresAt || company.createdAt;
  
  let currentPeriodStart = new Date(anchorDate);
  let currentPeriodEnd = new Date(currentPeriodStart);
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  let isTrialPeriod = false;

  if (now < currentPeriodStart) {
    currentPeriodStart = company.createdAt;
    currentPeriodEnd = new Date(anchorDate);
    isTrialPeriod = true;
  } else {
    while (currentPeriodEnd <= now) {
      currentPeriodStart.setMonth(currentPeriodStart.getMonth() + 1);
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }
  }

  const isProfifaktura = company.registeredApp === 'ProfiFaktura' || process.env.APP_NAME === 'ProfiFaktura';
  
  let currentUsage = 0;
  if (isProfifaktura) {
    const [{ value }] = await db.select({ value: count() }).from(invoices)
      .where(and(
        eq(invoices.companyId, auth.activeCompanyId),
        gte(invoices.createdAt, currentPeriodStart),
        lt(invoices.createdAt, currentPeriodEnd)
      ));
    currentUsage = value;
  } else {
    const [{ value }] = await db.select({ value: count() }).from(orders)
      .where(and(
        eq(orders.companyId, auth.activeCompanyId),
        gte(orders.createdAt, currentPeriodStart),
        lt(orders.createdAt, currentPeriodEnd)
      ));
    currentUsage = value;
  }

  const enhancedCompany = {
    ...company,
    isProfifaktura,
    currentUsage,
    currentPeriodStart,
    currentPeriodEnd,
    isTrialPeriod,
    nextBillingDate: isTrialPeriod && company.trialExpiresAt ? company.trialExpiresAt : currentPeriodEnd
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Team & Paket</h1>
          <p className="text-slate-500 mt-2">Verwalte den Zugriff deines Teams auf diesen Mandanten.</p>
        </div>
      </div>

      <UserList 
        initialMembers={enrichedMembers} 
        currentUserRole={auth.role} 
        currentUserId={auth.userId} 
        subscriptionDetails={enhancedCompany}
      />
    </div>
  )
}
