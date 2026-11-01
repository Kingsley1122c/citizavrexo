# Production backup and restore

## Scope

CITIZAVREXO uses one SQLite database at `/var/data/Citizavrexo.db` on a Render persistent disk. The disk keeps data across deploys. Render captures a disk snapshot every 24 hours and retains snapshots for seven days. Those snapshots share the Render failure and account boundary and are not an independent off-site backup.

The independent backup target should be a private Cloudflare R2 bucket in an account controlled by the platform owner. Backblaze B2 is a suitable alternative. The database is encrypted locally before upload, so the storage provider never receives plaintext application data.

## Schedule and retention

- Create and upload one encrypted backup every 24 hours.
- Retain 7 daily backups, 4 weekly backups, and 12 monthly backups.
- Run a restore verification after every backup and a documented restoration drill at least quarterly.
- Keep Render's daily snapshots enabled as a separate short-term recovery layer.

## Credentials and encryption

- Generate `BACKUP_ENCRYPTION_KEY` as 32 random bytes encoded in canonical base64.
- Store it only in Render secret configuration and in the organization's approved password or secrets manager.
- Never store the key in Git, a backup filename, application logs, object metadata, or the backup bucket.
- Give bucket credentials write/read access only to the private backup bucket. Do not grant public access or account-wide administration.
- Limit access to the client owner and one designated operations custodian. Record and review access at least quarterly.

## Create a consistent encrypted backup

The command uses `better-sqlite3`'s online backup API rather than copying the live database file. This creates a consistent SQLite snapshot while production remains available, validates it, encrypts it with AES-256-GCM, and deletes the temporary plaintext copy.

Run from a Render shell with `BACKUP_ENCRYPTION_KEY` supplied as a secret:

```bash
npm run db:backup -- /tmp/Citizavrexo-YYYYMMDDTHHMMSSZ.nvbackup
```

Upload the resulting `.nvbackup` file to the private object-storage bucket over HTTPS, verify the remote object size/checksum, and delete the local `/tmp` artifact. Do not place independent backups on `/var/data`; loss of the Render disk would remove both copies.

Automation is not complete until a scheduled job performs the backup, uploads it, verifies the remote object, applies retention, and alerts on failure. A scheduler running outside Render must invoke a narrowly authenticated backup process because another Render service cannot safely mount the active SQLite disk.

## Verify and drill restoration

Download one encrypted object into a disposable, access-controlled environment. Do not use the production database path.

```bash
export BACKUP_ENCRYPTION_KEY='<retrieve from the secrets manager>'
npm ci
npm run db:backup:verify -- ./restore-drill/Citizavrexo-backup.nvbackup
npm run db:restore -- ./restore-drill/Citizavrexo-backup.nvbackup ./restore-drill/Citizavrexo-restored.db
DATABASE_URL=file:./restore-drill/Citizavrexo-restored.db npm run db:migrate
```

The verification command decrypts only into operating-system temporary storage, runs `PRAGMA integrity_check` and `PRAGMA foreign_key_check`, checks the expected schema, confirms an active administrator and audit history exist, confirms core application data exists, and then removes the plaintext temporary database. The restore command refuses to overwrite any existing database and validates the restored copy before making it available.

For each quarterly drill, use a downloaded copy of an actual production backup and record the backup object identifier, backup date, test date, operator, integrity result, migration result, and recovery time. Do not record user data, credentials, tokens, or encryption keys. A drill against generated or seeded data validates the tooling but does not count as a production-backup restoration test.

## Production database loss

1. Put the service into maintenance mode or suspend it so no writes occur.
2. Identify the newest verified independent backup and compare its timestamp with the latest Render snapshot.
3. Restore the encrypted artifact to a new database filename. Never overwrite the only remaining database copy.
4. Run backup verification and forward-only migrations against the restored filename.
5. Have an authorized operator switch `DATABASE_URL` to the verified restored file and redeploy one instance.
6. Verify health, administrator login, user/account counts without exposing records, recent audit continuity, and critical application routes.
7. Preserve the failed database and logs under restricted access for investigation.
8. Record the recovery point, recovery time, validation results, and approvers.

## Cost

Cloudflare R2 is expected to cost approximately $0 for this small database while usage remains within its current Standard storage allowance of 10 GB-month per month; above that allowance, Standard storage is currently $0.015 per GB-month plus operation charges. Backblaze B2 currently starts at $6.95 per TB-month (approximately $0.00695 per GB-month). Verify provider pricing before approval. Render snapshots are already included with the current persistent disk but do not replace independent storage.

No provider subscription, bucket, access credential, scheduler, or production backup has been created by this repository change. Those steps require explicit owner approval.
