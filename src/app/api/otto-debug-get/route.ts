import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { marketplaceIntegrations } from '@/db/schema/integrations';
import { eq } from 'drizzle-orm';
import { OttoAdapter } from '@/adapters/marketplace/otto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');
    
    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: (integrations, { eq, and }) => and(eq(integrations.type, 'otto'), eq(integrations.isActive, true))
    });

    if (!integration) return NextResponse.json({ error: 'No otto integration found' }, { status: 404 });

    const adapter = new OttoAdapter({
      clientId: integration.clientId!,
      clientSecret: integration.clientSecret!,
      environment: 'production',
      connectionType: (integration.metadata as any)?.connectionType || 'service_partner',
      installationId: (integration.metadata as any)?.installationId,
      appId: (integration.metadata as any)?.appId
    });

    const token = await (adapter as any).getAccessToken();

    const url = sku ? `https://api.otto.market/v5/products?sku=${sku}` : `https://api.otto.market/v5/products?limit=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    const data = await res.text();
    return NextResponse.json({
      status: res.status,
      data: JSON.parse(data || '{}')
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
