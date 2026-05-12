import { redirect } from 'next/navigation'

export default function Home() {
  // We don't have a marketing page yet, so route straight to the app logic
  redirect('/login')
}
