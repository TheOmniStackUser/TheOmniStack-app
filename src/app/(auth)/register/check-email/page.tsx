import Link from 'next/link'
import { Mail } from 'lucide-react'

export default function CheckEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full">
            <Mail className="w-12 h-12 text-blue-600" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Postfach prüfen</h1>
        <p className="text-gray-600 mb-8">
          Wir haben dir einen Bestätigungslink gesendet. 
          Bitte klicke auf den Link in der E-Mail, um deine Registrierung fortzusetzen.
        </p>

        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Nichts erhalten? Schau auch in deinem Spam-Ordner nach.
          </p>
          
          <Link 
            href="/register" 
            className="text-blue-600 hover:text-blue-500 font-medium text-sm"
          >
            Nochmal versuchen
          </Link>
        </div>
      </div>
    </div>
  )
}
