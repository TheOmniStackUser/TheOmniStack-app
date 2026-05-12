import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db } from '@/db/client'
import { companies, companyMembers } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { switchCompanyAction } from '@/app/actions/auth'

export default async function SelectCompanyPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const memberships = await db
    .select({
      id: companies.id,
      name: companies.name,
      role: companyMembers.role,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.userId, session.userId))

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Unternehmen auswählen</h1>
          <p className="text-gray-500 mt-2">Wähle den Mandanten, den du verwalten möchtest.</p>
        </div>
        
        {memberships.length === 0 ? (
          <div className="text-center p-6 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-gray-600 mb-4">Du bist noch keinem Unternehmen zugeordnet.</p>
            {/* Later we can link to a "create company" flow here */}
            <p className="text-sm text-gray-500">Bitte wende dich an einen Administrator.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {memberships.map((company) => (
              <form action={switchCompanyAction} key={company.id}>
                <input type="hidden" name="companyId" value={company.id} />
                <button
                  type="submit"
                  className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 hover:shadow-sm transition-all text-left"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{company.name}</div>
                    <div className="text-sm text-gray-500 mt-1 capitalize flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Rolle: {company.role}
                    </div>
                  </div>
                  <span className="text-blue-500 group-hover:translate-x-1 transition-transform">→</span>
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
