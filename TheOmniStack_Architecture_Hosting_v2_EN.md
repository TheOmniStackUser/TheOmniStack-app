# TheOmniStack – Architecture & Hosting
## Documentation (v2)

**Status:** May 2026
**Project:** TheOmniStack (Multi-Tenant SaaS for E-Commerce)

---

### 1. Introduction

TheOmniStack is a modern, multi-tenant Software-as-a-Service platform. It enables e-commerce merchants to centralize their order management, automate invoicing, and perform seamless, comprehensive label creation across various shipping service providers.

### 2. Technology Stack (Core)

The platform is based on the most modern web technologies for maximum performance, type safety, and scalability:

- **Frontend & API Layer:** Next.js (App Router) with React
- **Language:** TypeScript (Fullstack) for error-resistant code
- **Styling:** Tailwind CSS for fast, responsive, and modern user interfaces
- **Database:** PostgreSQL
- **ORM (Object-Relational Mapping):** Drizzle ORM for type-safe database queries
- **Background Jobs & Queues:** BullMQ with Redis (for asynchronous processing of order imports and synchronizations)

---

### 3. Infrastructure & Hosting Environments

To guarantee reliability, data protection, and a smooth development process, TheOmniStack is operated in two strictly separated environments.

#### 3.1 Production Environment (Production)

The live environment for all active merchants and tenants. Here, the focus is on high availability and automatic scaling.

- **Frontend & Serverless API (Hosting):** Vercel. Vercel handles global CDN caching, SSL management, and automatic scaling of Next.js Server Actions.
- **Main Database:** Managed PostgreSQL database. Regular automated backups and Point-in-Time-Recovery protect against data loss.
- **Redis Cluster:** A managed Redis service caches the BullMQ queues for background processes.
- **Worker Processes (Background Sync):** Dedicated Node.js services (Worker) running independently of the web frontend. They continuously process the Redis queues to download orders from marketplaces (like Otto or Amazon) every minute without slowing down the user's web interface.
- **External APIs:** All adapters (DHL, Hermes, Otto, Mirakl) communicate exclusively with the live/production endpoints of the respective third-party providers.

#### 3.2 Test & Development Environment (Staging / Development)

This environment serves agile further development and quality assurance (QA) before new features are released to customers.

- **Local Development (Docker):** Development takes place isolated in Docker containers (e.g., the `easybill_dev` container). This ensures that every developer works on the exact same system setup that will later go into production.
- **Preview Deployments:** Through the CI/CD pipeline in Vercel, an isolated staging URL is generated with every code push (e.g., a Pull Request). This allows new features to be tested within the team or with stakeholders before they merge into the main branch.
- **Isolated Databases:** The staging environment is connected to a completely independent PostgreSQL test database. Real customer data remains untouched.
- **Sandbox APIs:** All marketplace and shipping integrations (Amazon, Otto, Mirakl, DHL, Hermes) can be configured to the environment mode `'sandbox'` in the system backend. In this setting, internal adapters communicate exclusively with the test and sandbox servers of the third-party providers (e.g., `https://sandbox.api.otto.market`), ensuring no real orders are falsified and no real shipping costs are generated.

---

### 4. System Architecture: Integrations (Adapter Pattern)

The core of TheOmniStack is the modular connection of sales channels and logistics providers. The system utilizes the Adapter Pattern, allowing new platforms to be connected in a standardized way.

#### 4.1 Marketplaces & Shop Systems (Inbound)

The import of orders and the return transmission of shipping confirmations are standardized for the following systems:

- **Amazon EU:** Connection via Amazon Selling Partner API (SP-API) with OAuth2 and Token Rotation.
- **Otto Partner Connect:** Strict REST API (v4) with Basic Auth for OAuth2 Token Exchange.
- **Mirakl (e.g., Decathlon & Custom):** Dynamic architecture that allows an arbitrary number of Mirakl-based marketplaces (like Limango, Worten, etc.) to be connected via the same logic (with variable endpoints).
- **Shopify & About You:** Direct API communication via Admin API Tokens.

#### 4.2 Shipping Service Providers (Outbound)

The logistics adapters handle automated label creation.

- **DHL (Post & Parcel Germany v2):** API Gateway connection using Basic Auth and App Secret. Supports national/international zones, additional services, and complex logic for return labels (Online vs. Enclosed).
- **Hermes:** Secure connection via the Hermes HSI Portal using OAuth.
- **Routing Logic:** The platform intelligently decides per marketplace (e.g., for Otto) whether a return label must be enclosed in the parcel or whether the marketplace handles the return independently.

#### 4.3 Returns Management (Returns Processing)

The platform offers a centralized returns management system for the efficient reversal of orders.

- **Returns Registration:** Automatic and manual import of customer returns across all connected sales channels.
- **Condition Check & Refund:** Workflow-supported inspection of returned items and automated triggering of the refund via the corresponding marketplace or shop APIs.
- **Status Synchronization:** Continuous transmission of the return status back to the original sales channel.

#### 4.4 Inventory Management (Warenwirtschaft)

TheOmniStack features an integrated inventory management system (Wawi) for cross-platform stock control.

- **Central Item Master:** Management of all product data, EANs, SKUs, and prices in a central database.
- **Real-time Stock Synchronization:** Automatic adjustment of inventory levels across all connected marketplaces and shops. As soon as an item is sold, the system reduces the stock on all other channels to prevent overselling.
- **Stock Bookings:** Seamless logging of all incoming goods, outgoing goods, and manual corrections for maximum transparency.

---

### 5. Security & Data Protection (Compliance)

- **Multi-Tenancy:** The architecture enforces absolute separation of all tenants at the database level (using Drizzle ORM filters and the Auth Session `companyId`). A user never has access to the invoices or API keys of another merchant.
- **Encryption:** Sensitive API keys and secrets of third-party providers (DHL, Amazon, etc.) are stored and transmitted in encrypted form.
- **Financial Compliance (GoBD):** To meet strict accounting requirements, TheOmniStack implements seamless invoice journals and detailed CSV/DATEV exports. VAT ID validation is integrated natively.

---

### 6. Backup & Disaster Recovery

To prevent data loss and ensure high reliability, an automated backup strategy is implemented:

- **Daily Automated Backup (GitHub Actions):** A cron job runs every night (at 03:00 UTC) via GitHub Actions.
- **Database Backup (PostgreSQL):** The main database (Neon) is exported using `pg_dump`. The resulting `.sql.gz` archive is securely uploaded to a separate backup bucket on AWS S3. Through an AWS S3 Lifecycle Rule, database backups are automatically deleted after 30 days to optimize storage space and costs.
- **Document Backup (S3):** All GoBD-compliant invoices and documents generated in the production S3 bucket are mirrored into the dedicated backup bucket via `aws s3 sync`. (These documents are exempt from the Lifecycle Rule and are retained permanently).
- **Notifications:** After every successful or failed backup run, a status email is automatically sent (via Resend) to the administrator to monitor backup integrity.
- *(Redis/Queue data is deliberately not backed up persistently, as it is only used for temporary background jobs).*
