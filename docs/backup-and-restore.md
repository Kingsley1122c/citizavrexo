# Persistent SQLite backup and recovery

## Production storage

Citizavrexo uses one Render web service with one attached SSD. The disk mounts at `/var/data`, the SQLite database is `/var/data/citizavrexo.db`, and profile images are stored in `/var/data/profile-images`.

The minimum suitable Render configuration is one `0.5c-512mb` web instance at $7/month and a 1 GB SSD at $0.25/month, for $7.25/month before bandwidth or build-minute overages. Keep the service at one instance while SQLite remains the datastore.

`npm run start:production` creates the storage directories, creates a SQLite online snapshot under `/var/data/backups`, retains the five newest pre-migration snapshots, applies every Drizzle migration, and preserves an existing administrator. Bootstrap values are used only when the database has no administrator.

Render encrypts disks and snapshots at rest. Render takes one disk snapshot every 24 hours and retains snapshots for seven days. Render advises against using a raw disk snapshot as the primary recovery method for a custom database, so use application-level SQLite backups for routine recovery.

## Independent encrypted backup

Generate a canonical base64-encoded 32-byte `BACKUP_ENCRYPTION_KEY` and keep it outside Render. Never put it in source control.

```bash
DATABASE_URL=file:/var/data/citizavrexo.db npm run db:backup -- /var/data/backups/citizavrexo.nvbackup
npm run db:backup:verify -- /var/data/backups/citizavrexo.nvbackup
```

Copy encrypted backups to an independent restricted location. A backup that exists only on the same disk is not sufficient disaster recovery.

## Restore procedure

1. Put the service into a maintenance window and create a final encrypted backup.
2. Stop writes to the database.
3. Restore to a new path: `npm run db:restore -- <backup.nvbackup> /var/data/citizavrexo-restored.db`.
4. Verify the restored file and retain the old database.
5. Move the restored file to `/var/data/citizavrexo.db` while the service is stopped.
6. Start the service, verify `/api/health`, administrator login, record counts, balances, audit history, and profile images.

All financial operations remain simulated. No banking rail, card network, or payment provider moves real money.
