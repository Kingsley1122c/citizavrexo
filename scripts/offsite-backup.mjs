import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const executeFile = promisify(execFile);
const requiredEnvironment = [
  "BACKUP_S3_ENDPOINT",
  "BACKUP_S3_REGION",
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_ACCESS_KEY_ID",
  "BACKUP_S3_SECRET_ACCESS_KEY",
];

export function resolveOffsiteConfiguration(environment = process.env) {
  const missing = requiredEnvironment.filter((name) => !environment[name]);
  if (missing.length) throw new Error(`Off-site backup configuration is incomplete: ${missing.join(", ")}.`);
  const retentionDays = Number(environment.BACKUP_RETENTION_DAYS ?? "35");
  if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 3650) throw new Error("BACKUP_RETENTION_DAYS must be an integer from 7 through 3650.");
  const prefix = (environment.BACKUP_S3_PREFIX ?? "citizavrexo").replace(/^\/+|\/+$/g, "");
  if (!prefix || !/^[A-Za-z0-9!_.*'()/-]+$/.test(prefix)) throw new Error("BACKUP_S3_PREFIX contains unsupported characters.");
  return {
    endpoint: environment.BACKUP_S3_ENDPOINT,
    region: environment.BACKUP_S3_REGION,
    bucket: environment.BACKUP_S3_BUCKET,
    accessKeyId: environment.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: environment.BACKUP_S3_SECRET_ACCESS_KEY,
    prefix,
    retentionDays,
    stateFile: environment.BACKUP_STATE_FILE ?? "/var/data/backups/offsite-success.json",
  };
}

export function expiredBackupKeys(objects, prefix, retentionDays, now = new Date()) {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  return objects
    .filter((object) => object.Key?.startsWith(`${prefix}/`) && object.Key.endsWith(".nvbackup") && object.LastModified instanceof Date && object.LastModified.getTime() < cutoff)
    .map((object) => object.Key);
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function listBackups(client, configuration) {
  const objects = [];
  let continuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: configuration.bucket,
      Prefix: `${configuration.prefix}/`,
      ContinuationToken: continuationToken,
    }));
    objects.push(...(response.Contents ?? []));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function writeSuccessState(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const partial = `${path}.partial`;
  await writeFile(partial, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(partial, path);
}

export async function runOffsiteBackup(environment = process.env, dependencies = {}) {
  const configuration = resolveOffsiteConfiguration(environment);
  if (!environment.BACKUP_ENCRYPTION_KEY) throw new Error("BACKUP_ENCRYPTION_KEY is required.");
  const directory = await mkdtemp(join(tmpdir(), "Citizavrexo-offsite-"));
  const createdAt = new Date();
  const filename = `citizavrexo-${createdAt.toISOString().replaceAll(":", "-")}.nvbackup`;
  const backupPath = join(directory, filename);
  const client = dependencies.client ?? new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: true,
    credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey },
  });
  try {
    const runCommand = dependencies.executeFile ?? executeFile;
    await runCommand(process.execPath, ["scripts/database-backup.mjs", "create", backupPath], { cwd: process.cwd(), env: environment });
    await runCommand(process.execPath, ["scripts/database-backup.mjs", "verify", backupPath], { cwd: process.cwd(), env: environment });
    const details = await stat(backupPath);
    const digest = await sha256(backupPath);
    const key = `${configuration.prefix}/${filename}`;
    await client.send(new PutObjectCommand({
      Bucket: configuration.bucket,
      Key: key,
      Body: createReadStream(backupPath),
      ContentLength: details.size,
      ContentType: "application/octet-stream",
      Metadata: { sha256: digest, format: "nvbackup02" },
    }));
    const expiredKeys = expiredBackupKeys(await listBackups(client, configuration), configuration.prefix, configuration.retentionDays, createdAt);
    if (expiredKeys.length) await client.send(new DeleteObjectsCommand({
      Bucket: configuration.bucket,
      Delete: { Objects: expiredKeys.map((Key) => ({ Key })), Quiet: true },
    }));
    await writeSuccessState(configuration.stateFile, { completedAt: createdAt.toISOString(), key, bytes: details.size, sha256: digest });
    console.log(`Encrypted off-site backup uploaded: ${basename(key)}`);
  } finally {
    client.destroy?.();
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOffsiteBackup().catch((error) => {
    console.error(error instanceof Error ? error.message : "Off-site backup failed.");
    process.exitCode = 1;
  });
}