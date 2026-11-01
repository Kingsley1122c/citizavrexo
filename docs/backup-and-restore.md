# Persistent SQLite backup and recovery

## Production storage

Citizavrexo uses one Render web service with one attached SSD. The disk mounts at `/var/data`, the SQLite database is `/var/data/citizavrexo.db`, and profile images are stored in `/var/data/profile-images`.

The minimum suitable Render configuration is one `0.5c-512mb` web instance at $7/month and a 1 GB SSD at $0.25/month, for $7.25/month before bandwidth or build-minute overages. Keep the service at one instance while SQLite remains the datastore.

`npm run start:production` creates the storage directories, creates a SQLite online snapshot under `/var/data/backups`, retains the five newest pre-migration snapshots, applies every Drizzle migration, and preserves an existing administrator. Bootstrap values are used only when the database has no administrator.

Render encrypts disks and snapshots at rest. Render takes one disk snapshot every 24 hours and retains snapshots for seven days. Render advises against using a raw disk snapshot as the primary recovery method for a custom database, so use application-level SQLite backups for routine recovery.

## Independent encrypted backup

The version 2 backup is one AES-256-GCM encrypted bundle containing an online SQLite snapshot, every uploaded profile image, and a manifest of SHA-256 checksums. Creation fails if SQLite integrity, expected tables, an active administrator, audit data, or a database-referenced image cannot be verified.

Generate a canonical base64-encoded 32-byte `BACKUP_ENCRYPTION_KEY`. Keep a recovery copy of this key in a restricted password manager outside Render and outside the backup bucket. Never put it in source control. Losing the key makes every encrypted backup unrecoverable.

```bash
DATABASE_URL=file:/var/data/citizavrexo.db PROFILE_IMAGE_DIR=/var/data/profile-images npm run db:backup -- /var/data/backups/citizavrexo.nvbackup
npm run db:backup:verify -- /var/data/backups/citizavrexo.nvbackup
```

### Off-site schedule

The production process includes an opt-in scheduler. It runs a due check hourly, creates one verified encrypted bundle every 24 hours, uploads it to an S3-compatible bucket, and deletes Citizavrexo bundle objects older than 35 days. Temporary archives are removed after each attempt. Only the small last-success marker remains on the Render disk.

The scheduler remains disabled unless `BACKUP_ENCRYPTION_KEY`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, and `BACKUP_S3_SECRET_ACCESS_KEY` are all configured. Use bucket credentials restricted to list, create, and delete objects under the configured `BACKUP_S3_PREFIX`. Enable bucket versioning or object lock when the selected provider supports it.

No off-site provider has been activated or purchased. Configure these variables only after the owner approves the provider and its exact recurring cost. An encrypted backup that exists only on `/var/data` is not independent disaster recovery.

Run an approved destination manually without waiting for the scheduler:

```bash
npm run db:backup:offsite
```

## Isolated restoration test

Never test a restore over the live paths. Download one encrypted object into a disposable environment that has the matching `BACKUP_ENCRYPTION_KEY`, then restore both outputs to new destinations:

```bash
npm run db:backup:verify -- ./downloaded.nvbackup
npm run db:restore -- ./downloaded.nvbackup ./restore-test/citizavrexo.db ./restore-test/profile-images
DATABASE_URL=file:./restore-test/citizavrexo.db PROFILE_IMAGE_DIR=./restore-test/profile-images npm run start:production
```

Verify administrator login, user/account/transaction/audit counts, balances, transaction receipts, and each referenced profile image. The automated test `npm run db:backup:test` performs create, authenticated decrypt, checksum verification, and isolated database/image restoration without reading or overwriting production.

## Production restoration procedure

1. Put the service into a maintenance window and create a final encrypted backup.
2. Stop writes to the database.
3. Download the selected off-site object and run `npm run db:backup:verify -- <backup.nvbackup>`.
4. Restore to unused paths: `npm run db:restore -- <backup.nvbackup> /var/data/citizavrexo-restored.db /var/data/profile-images-restored`.
5. Start a separate test environment against the restored paths and complete the isolated checks above.
6. Retain the current live database and image directory, then move the verified restored outputs into the live paths while the service is stopped.
7. Start the service and verify `/api/health`, administrator login, record counts, balances, transaction and audit history, and profile images.

All financial operations remain simulated. No banking rail, card network, or payment provider moves real money.
