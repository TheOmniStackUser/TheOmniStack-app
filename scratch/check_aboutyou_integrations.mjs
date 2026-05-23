import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const integrations = await sql`
      SELECT id, company_id, is_active, environment, api_key 
      FROM marketplace_integrations 
      WHERE type = 'aboutyou'
    `
    console.log("About You Integrations:")
    integrations.forEach(i => {
      console.log({
        id: i.id,
        company_id: i.company_id,
        is_active: i.is_active,
        environment: i.environment,
        api_key: i.api_key ? `${i.api_key.substring(0, 10)}...` : null
      })
    })
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
