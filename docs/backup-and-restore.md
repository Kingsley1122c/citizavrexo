# Ephemeral hosting and recovery

## Approved Free configuration

The Render Free service stores the SQLite database at `/tmp/citizavrexo/Citizavrexo.db` and profile images at `/tmp/citizavrexo/profile-images`. Render does not preserve these paths after an idle spin-down, restart, or redeploy. Accounts, balances, transactions, audit history, email state, sessions, and uploaded images therefore reset together.

On every fresh filesystem, `npm run start:free` creates the required directories, applies all Drizzle migrations, and provisions the configured super administrator if no administrator exists. Repeated starts against the same filesystem do not create another administrator.

## Operating boundary

- All financial operations are simulated. No banking rail, card network, or payment provider moves real money.
- This configuration is unsuitable for real users or real financial records.
- There is no backup, restore, continuity, or recovery-point guarantee.
- Do not store information that must survive service interruption.
- Cross-currency transfers remain unavailable unless the configured exchange-rate provider is usable.
- Keep the service at one instance while SQLite remains the datastore.

## Required secrets

Configure `RECOVERY_CODE_PEPPER`, `EPHEMERAL_ADMIN_EMAIL`, `EPHEMERAL_ADMIN_NAME`, `EPHEMERAL_ADMIN_PASSWORD`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `CUSTOMER_SERVICE_EMAIL`, and `OPEN_EXCHANGE_RATES_APP_ID` in Render. Never commit these values or expose them through `NEXT_PUBLIC_*` variables.

The administrator password must contain 12 to 128 characters. The initializer hashes it with Argon2 and does not print the administrator identity or credentials. Registration remains unavailable when transactional email delivery is not fully configured.

## Moving to persistent hosting

Before accepting production records, replace temporary local storage with an approved persistent datastore and image store. Add encrypted independent backups, retention rules, monitoring, access controls, and documented restore tests. The repository backup utilities can support a future persistent SQLite deployment, but running them against the Free service does not provide continuity because both the active database and local backup artifacts can disappear together.

No Render service, provider subscription, external datastore, backup target, or deployment is created by this repository configuration.
