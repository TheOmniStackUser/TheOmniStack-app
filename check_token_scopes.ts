import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';
import { OttoAdapter } from './src/adapters/marketplace/otto';

function parseJwt(token: string) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  } catch (e) {
    return null;
  }
}

async function main() {
  const ints = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'));
  
  for (const i of ints) {
    if (i.environment !== 'production') continue;
    
    console.log(`\nTesting integration ${i.companyId}...`);
    const adapter = new OttoAdapter({
      clientId: i.clientId!,
      clientSecret: i.clientSecret!,
      environment: 'production',
      installationId: (i.metadata as any)?.installationId,
      appId: (i.metadata as any)?.appId,
      connectionType: (i.metadata as any)?.connectionType || 'service_partner'
    });
    
    try {
      const token = await (adapter as any).getAccessToken();
      const decoded = parseJwt(token);
      if (decoded) {
        console.log(`Token scopes:`, decoded.scope || decoded.scopes || decoded.realm_access?.roles);
      } else {
        console.log('Could not decode JWT');
      }
    } catch (e: any) {
      console.log(`Error fetching token:`, e.message);
    }
  }
  process.exit(0);
}
main();
