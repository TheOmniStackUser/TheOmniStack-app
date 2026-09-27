import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { marketplaceIntegrations } from '@/db/schema/integrations';
import { eq } from 'drizzle-orm';
import { OttoAdapter } from '@/adapters/marketplace/otto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });

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

        const getRes = await fetch(`https://api.otto.market/v5/products/update-tasks/${taskId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });

        if (!getRes.ok) continue;

        return NextResponse.json({
          getStatus: getRes.status,
          data: await getRes.json()
        });
      } catch (e: any) {
        // ignore
      }
    }

    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
