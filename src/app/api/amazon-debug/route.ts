import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { marketplaceIntegrations } from '@/db/schema/integrations';
import { eq } from 'drizzle-orm';
import { AmazonAdapter } from '@/adapters/marketplace/amazon';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sku = searchParams.get('sku');

  if (!sku) {
    return NextResponse.json({ error: 'Missing sku' }, { status: 400 });
  }

  try {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        eq(marketplaceIntegrations.type, 'amazon')
      )
      .limit(1);

    if (!integration) {
      return NextResponse.json({ error: 'Amazon integration not found' }, { status: 404 });
    }

    const meta = integration.metadata as any;
    const adapter = new AmazonAdapter({
      clientId: integration.clientId!,
      clientSecret: integration.clientSecret!,
      refreshToken: integration.refreshToken!,
      sellerId: meta.sellerId
    });

    const token = await (adapter as any).getAccessToken();

    const res = await fetch(`https://sellingpartnerapi-eu.amazon.com/listings/2021-08-01/items/${meta.sellerId}/${sku}?marketplaceIds=A1PA6795UKMFR9&issueLocale=de_DE`, {
      headers: {
        'x-amz-access-token': token,
        'Accept': 'application/json'
      }
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
