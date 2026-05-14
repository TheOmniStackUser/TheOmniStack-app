import { verifyEmailTokenAction } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    redirect('/register')
  }

  const result = await verifyEmailTokenAction(token)

  if ('error' in result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 p-4 rounded-full">
              <AlertCircle className="w-12 h-12 text-red-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Verifizierung fehlgeschlagen</h1>
          <p className="text-gray-600 mb-8">{result.error}</p>
          <Link 
            href="/register" 
            className="inline-block w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Zurück zur Registrierung
          </Link>
        </div>
      </div>
    )
  }

  // If successful, we show a quick success message
  const isExistingUser = !('email' in result)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-green-100 p-4 rounded-full">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">E-Mail verifiziert!</h1>
        <p className="text-gray-600 mb-8">
          {isExistingUser 
            ? (result as any).message
            : <>Vielen Dank. Deine E-Mail <strong>{(result as any).email}</strong> wurde erfolgreich bestätigt. Im nächsten Schritt vervollständigen wir dein Profil.</>
          }
        </p>
        <Link 
          href={isExistingUser ? '/login' : `/register/details?token=${token}`}
          className="inline-block w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          {isExistingUser ? 'Zum Login' : 'Details eingeben'}
        </Link>
      </div>
    </div>
  )
}
