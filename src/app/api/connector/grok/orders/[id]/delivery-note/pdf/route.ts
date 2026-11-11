import { authenticateGrokRequest } from '@/lib/grok-connector/auth'
import { getOrGenerateDeliveryNotePdf } from '@/lib/grok-connector/delivery-notes'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateGrokRequest(req)
  if (!authResult.success) return authResult.response

  const { id } = await props.params

  try {
    const { pdfBuffer, filename } = await getOrGenerateDeliveryNotePdf(id, authResult.auth.companyId)

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err: any) {
    console.error(`[Connector DeliveryNote PDF] Error generating PDF for order ${id}:`, err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Failed to generate delivery note PDF',
      }),
      {
        status: err.message?.includes('not found') ? 404 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
