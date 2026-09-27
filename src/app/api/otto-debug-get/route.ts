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
    
    const integrations = await db.query.marketplaceIntegrations.findMany({
      where: (integrations, { eq, and }) => and(eq(integrations.type, 'otto'), eq(integrations.isActive, true))
    });

    let foundData = null;

    for (const integration of integrations) {
      try {
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

        if (res.ok) {
          const dataStr = await res.text();
          const data = JSON.parse(dataStr || '{}');
          if (data.productVariations && data.productVariations.length > 0) {
            foundData = { status: res.status, data };
            break;
          }
        }
      } catch (e) {
        console.error("Skipping integration due to error:", e);
      }
    }

    if (!foundData) {
      return NextResponse.json({ error: 'Product not found in any integration' }, { status: 404 });
    }

    return NextResponse.json(foundData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
