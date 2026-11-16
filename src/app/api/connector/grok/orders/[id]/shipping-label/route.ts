import { NextResponse } from 'next/server'
import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { executeTool } from '@/lib/grok-connector/tools'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { id } = await props.params
  const url = new URL(req.url)
  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const carrier = body.carrier || url.searchParams.get('carrier') || undefined
  const parcelClass = body.parcelClass || body.parcel_class || url.searchParams.get('parcelClass') || url.searchParams.get('parcel_class') || undefined
  const weightKg = body.weightKg ?? body.weight_kg ?? (url.searchParams.get('weightKg') ? Number(url.searchParams.get('weightKg')) : undefined)
  const replaceExisting = body.replaceExisting ?? body.replace_existing ?? (url.searchParams.get('replaceExisting') === 'true')
  const dryRun = body.dryRun ?? body.dry_run ?? (url.searchParams.get('dryRun') === 'true')

  const result = await executeTool(
    'generate_shipping_label',
    {
      orderId: id,
      carrier,
      parcelClass,
      weightKg,
      replaceExisting,
      dryRun,
    },
    authResult.auth
  )
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
