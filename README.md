# CITIZAVREXO

CITIZAVREXO is a Modern Minimal financial account-management application built with Next.js 16, React 19, strict TypeScript, Tailwind CSS 4, Drizzle ORM, and SQLite.

## Application surfaces

- `/` authenticated user workspace for accounts, transaction history, cards, notifications, profile, security, devices, and settings
- `/admin` separately authorized administrator workspace
- `/login`, `/register`, and `/forgot-password` authentication and recovery entry points
- Responsive desktop and mobile navigation, light/dark themes, USD-only financial records and display, and 14 persisted locale preferences

The complete customer interface, workflows, receipts, notifications, and transactional email copy are translated for English, French, Spanish, Portuguese, Japanese, Korean, Simplified Chinese, Traditional Chinese, Thai, Vietnamese, Indonesian, Malay, Hindi, and Bengali. The selected locale persists across authenticated sessions; registration also stores the selected locale for verification and welcome email delivery.

## Local setup

Copy `.env.example` to `.env.local` and replace `RECOVERY_CODE_PEPPER` with at least 32 cryptographically random characters. Never use the example value outside local development.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The idempotent seed creates development fixtures only:

- User: `amara@example.test` / `CitizavrexoDemo!2026`
- Super admin: `admin@example.test` / `CitizavrexoAdmin!2026`

Do not deploy these identities or passwords.

## Implemented backend boundaries

- Relational records for users, credentials, sessions, authentication tokens, accounts, transactions, physical cards and requests, profile details, bank destinations, withdrawals, notifications, devices, recovery requests, recovery codes, audit events, account-status history, administrator credits, and the email outbox
- Argon2 password hashing and opaque session tokens whose SHA-256 digests are the only persisted token values
- `HttpOnly`, `SameSite=Lax` session cookies, with `Secure` enabled in production
- Server-side route guards and role-based permissions for super admins, administrators, support agents, and auditors
- Ownership checks on user card, notification, and device mutations
- Session-linked device records whose revocation atomically revokes the represented session
- Persistent authentication throttling with hashed identifiers for login, registration, and password-reset requests
- A server-only ledger service that validates transaction direction/status, requires idempotency keys, derives balances, guards concurrent updates, and atomically writes account balance, transaction history, notification, and audit records
- Super-admin-only, idempotent account credits that atomically update the ledger and persist immutable transaction, notification, email, and audit records
- Customer suspension and restoration with immutable status history, immediate session and trusted-device revocation, notification, email, and audit records
- Strict profile persistence and a transactional profile-completion gate for physical-card requests
- Country-aware bank-destination validation and persisted withdrawal support details
- USD-only validation, persistence, formatting, and forward migration of legacy financial records without exchange-rate conversion
- HMAC-hashed recovery codes that rotate as a batch, are displayed once, and can be consumed once
- Database triggers preventing audit-event updates or deletion through the application database connection
- A persistent transactional-email outbox with exclusive worker claims, bounded retries, stale-claim recovery, provider idempotency, and runtime payload validation behind a replaceable transport interface
- Resend transactional delivery through `RESEND_API_KEY`, with the verified sender configured independently through `EMAIL_FROM`
- Expiring, single-use email-verification and password-reset links whose plaintext tokens are reconstructed only at delivery time and never persisted in the outbox
- A super-administrator ownership-transfer workflow with current-password reauthentication, an expiring single-use token, verified recipient creation, atomic demotion and suspension of the previous administrator, session and device revocation, and immutable audit history
- Zod validation at authentication action boundaries
- A production guard that prevents the development seed and unverified self-registration from running

`src/lib/demo-data.ts` remains a clearly labeled development reference. Protected pages do not use it as their data source.

## Render deployment

`render.yaml` defines one Node web service because file-backed SQLite cannot safely be shared by multiple application instances. It mounts a persistent disk at `/var/data`, sets `DATABASE_URL=file:/var/data/Citizavrexo.db`, runs forward-only migrations before `next start`, and uses `/api/health` to verify database access.

Set `RECOVERY_CODE_PEPPER` and `RESEND_API_KEY` as secrets in Render. Set `EMAIL_FROM` to a sender on a domain that Resend has verified and set `APP_URL` to the canonical HTTPS origin. Never copy `.env.local` into the repository. After the first successful migration, provision the initial administrator once from a Render shell by setting temporary `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` values and running:

```bash
npm run db:bootstrap-admin
```

Remove all three bootstrap variables immediately afterward. The command refuses to run once any administrator exists. Never run `npm run db:seed` in production.

## Client Handover

The client handover consists of administrator access to CITIZAVREXO.

The client receives administrator ownership through **Admin â†’ Settings â†’ Transfer ownership**. The client follows the secure ownership-transfer link and creates their own administrator password. The previous administrator's sessions are revoked when the transfer is completed.

Infrastructure, source-code, deployment, domain, email-service, and customer-service accounts remain under the developer/operator's control unless separately agreed with the client.

The application stores only the ownership-transfer verification-token hash. A completed transfer creates the verified replacement super administrator, suspends and demotes the previous administrator, and revokes all sessions and devices belonging to the previous identity.

The handover delivery adapter constructs the `https://citizavrexo.com/admin-transfer?token=...` link only at send time, never writes the plaintext token to the generic email outbox, logs, or analytics, and returns success only after Resend accepts the message.

The persistent disk requires a paid Render plan and must have snapshots or off-site backups configured before production financial records are accepted. Keep the service at one instance while SQLite remains the datastore.

The repository includes SQLite-safe encrypted backup, verification, and restore commands. See [Production backup and restore](docs/backup-and-restore.md). Render snapshots are short-term recovery points, not independent off-site backups.

## Production configuration still required

SQLite is suitable for this single-process deployment only when the Render persistent disk and backups are active. Before a multi-instance launch, migrate the Drizzle schema to an approved managed database with encryption, retention policies, and tested restore procedures.

The Resend transport and durable outbox worker run inside the single web process that owns the Render SQLite disk. The worker claims at most ten due messages per minute, retries failures at bounded intervals for at most five attempts, recovers stale claims, and uses stable provider idempotency keys to suppress duplicates. A persisted 90-message rolling daily budget keeps automated outbox delivery below Resend Free's 100-message daily limit. Self-registration remains blocked in production unless `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` are configured. Phone verification and new-device verification remain outside the current product scope. Real banking rails, payment networks, card issuing, identity verification, SMS, and biometric platform integrations are intentionally not connected.

Application-level authentication throttling is active, but an edge or gateway rate limiter is still required for distributed denial-of-service protection. Production audit records also require restricted database credentials, encrypted off-site export, retention controls, monitoring, and independent tamper evidence; local SQLite triggers protect against accidental or application-level mutation but not a database-owner compromise.

Infrastructure-dependent account creation, notification preferences, and help-center access remain unavailable or read-only in the interface. Profile editing, physical-card requests, super-admin account credits, and customer suspension/restoration use validated server-side data paths. Existing card controls, notifications, withdrawal support details, transaction details, exports, and administrator record views also use persisted application data.

## Commands

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:backup -- <output.nvbackup>
npm run db:backup:verify -- <input.nvbackup>
npm run db:restore -- <input.nvbackup> <new-database.db>
npx tsc --noEmit
npm run lint
npm test
npm run build
npm start
```

The default database is `./data/Citizavrexo.db`; set `DATABASE_URL=file:...` to use another SQLite file. Database files and local environment files are ignored.

## Security notes

- Keep `RECOVERY_CODE_PEPPER`, provider credentials, and session material out of `NEXT_PUBLIC_*` variables.
- Never persist passwords, plaintext action tokens, or recovery codes in the generic transactional email payload. Action links are reconstructed from token IDs only inside the delivery worker.
- Balance and transaction writes belong only in the trusted ledger service, never in browser state or general user actions.
- Every external ledger request must provide a stable, unique idempotency key.
- Development fixtures, local SQLite, and an unconfigured email transport are not production-hosted infrastructure.

