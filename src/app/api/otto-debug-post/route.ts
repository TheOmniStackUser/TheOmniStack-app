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
    if (!sku) return NextResponse.json({ error: 'Missing sku' }, { status: 400 });

    const integrations = await db.query.marketplaceIntegrations.findMany({
      where: (integrations, { eq, and }) => and(eq(integrations.type, 'otto'), eq(integrations.isActive, true))
    });

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

        // 1. GET existing product
        const getRes = await fetch(`https://api.otto.market/v5/products?sku=${sku}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });

        if (!getRes.ok) continue;

        const dataStr = await getRes.text();
        const data = JSON.parse(dataStr || '{}');
        if (!data.productVariations || data.productVariations.length === 0) continue;

        // 2. Modify MSRP
        const product = data.productVariations[0];
        if (!product.pricing) product.pricing = {};
        product.pricing.msrp = { amount: 249.90, currency: 'EUR' };

        // 3. POST it back
        const postRes = await fetch(`https://api.otto.market/v5/products`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([product])
        });

        return NextResponse.json({
          getStatus: getRes.status,
          postStatus: postRes.status,
          postResponse: await postRes.text()
        });

      } catch (e: any) {
        console.error("Skipping integration due to error:", e);
      }
    }

    return NextResponse.json({ error: 'Product not found in any integration' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
