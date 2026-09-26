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
    if (!sku) return NextResponse.json({ error: 'Missing sku parameter' }, { status: 400 });

    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: (integrations, { eq, and }) => and(eq(integrations.type, 'otto'), eq(integrations.isActive, true))
    });

    if (!integration) return NextResponse.json({ error: 'No otto integration found' }, { status: 404 });

    const adapter = new OttoAdapter({
      clientId: integration.clientId!,
      clientSecret: integration.clientSecret!,
      environment: 'production',
      connectionType: 'service_partner'
    });

    const token = await (adapter as any).getAccessToken();

    const payload = [
      {
        sku: sku,
        standardPrice: { amount: 249.90, currency: 'EUR' },
        msrp: { amount: 249.90, currency: 'EUR' },
        sale: {
          salePrice: { amount: 169.80, currency: 'EUR' },
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    ];

    const res = await fetch(`https://api.otto.market/v5/products/prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.text();
    return NextResponse.json({
      status: res.status,
      data
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
