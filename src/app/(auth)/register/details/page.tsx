'use client'

import { useActionState, use } from 'react'
import { completeRegistrationAction } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export default function DetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = use(searchParams)
  const [state, action, pending] = useActionState(completeRegistrationAction, undefined)

  if (!token) {
    redirect('/register')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Profil vervollständigen</h1>
          <p className="text-gray-500 mt-2">Erzähl uns etwas über dich und dein Unternehmen</p>
        </div>

        <form action={action} className="space-y-6">
          <input type="hidden" name="token" value={token} />
          
          {state?.message && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {state.message}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Dein Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {state?.errors?.name && <p className="mt-1 text-sm text-red-600">{state.errors.name}</p>}
          </div>

          <div className="py-2">
            <hr className="border-gray-200" />
          </div>

          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">Unternehmensname (Anzeige)</label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              required
              placeholder="Z.B. Acme Corp"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {state?.errors?.companyName && <p className="mt-1 text-sm text-red-600">{state.errors.companyName}</p>}
          </div>

          <div>
            <label htmlFor="companyLegalName" className="block text-sm font-medium text-gray-700">Rechtlicher Name (für Rechnungen)</label>
            <input
              id="companyLegalName"
              name="companyLegalName"
              type="text"
              required
              placeholder="Z.B. Acme Corporation GmbH"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {state?.errors?.companyLegalName && <p className="mt-1 text-sm text-red-600">{state.errors.companyLegalName}</p>}
          </div>

          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                required
                defaultChecked={state?.fields?.terms === 'on'}
                className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded cursor-pointer"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="terms" className="font-medium text-gray-700 cursor-pointer">
                Ich akzeptiere die <a href="/legal/AGB.pdf" target="_blank" className="text-blue-600 hover:underline">AGB</a> und die <a href="/legal/Widerrufsbelehrung.pdf" target="_blank" className="text-blue-600 hover:underline">Widerrufsbelehrung</a>.
              </label>
              <p className="text-gray-500">Bitte lies dir die Dokumente durch und stimme ihnen zu.</p>
            </div>
          </div>
          {state?.errors?.terms && <p className="mt-1 text-sm text-red-600">{state.errors.terms}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {pending ? 'Speichere...' : 'Registrierung abschließen'}
          </button>
        </form>
      </div>
    </div>
  )
}
