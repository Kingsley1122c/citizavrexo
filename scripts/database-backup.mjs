import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, appendFile, mkdir, mkdtemp, open, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";

const magic = Buffer.from("NVBKUP01", "ascii");
const ivLength = 12;
const tagLength = 16;
const requiredTables = [
  "accounts",
  "admin_credits",
  "administrator_transfers",
  "audit_events",
  "authentication_tokens",
  "auth_rate_limits",
  "bank_destinations",
  "card_requests",
  "cards",
  "credentials",
  "devices",
  "email_outbox",
  "internal_transfers",
  "notifications",
  "recovery_codes",
  "recovery_requests",
  "sessions",
  "transactions",
  "users",
  "user_profiles",
  "user_status_changes",
  "withdrawal_requests",
];

function encryptionKey() {
  const encoded = process.env.BACKUP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("BACKUP_ENCRYPTION_KEY is required.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.");
  }
  return key;
}

function databasePath(value = process.env.DATABASE_URL) {
  if (!value?.startsWith("file:")) throw new Error("DATABASE_URL must use the file: scheme.");
  return resolve(value.slice("file:".length));
}

async function assertMissing(path) {
  try {
    await access(path);
    throw new Error("The destination already exists; refusing to overwrite it.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function verifyDatabase(path) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = database.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error("SQLite integrity checking failed.");
    if (database.pragma("foreign_key_check").length) throw new Error("SQLite foreign-key checking failed.");

    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    if (requiredTables.some((table) => !tables.has(table))) throw new Error("The backup does not contain the expected schema.");
    if (!database.prepare("SELECT 1 FROM users WHERE admin_role IS NOT NULL AND status = 'active' LIMIT 1").get()) throw new Error("The backup does not contain an active administrator.");
    if (!database.prepare("SELECT 1 FROM audit_events LIMIT 1").get()) throw new Error("The backup does not contain audit records.");
    if (!database.prepare("SELECT 1 FROM users LIMIT 1").get()) throw new Error("The backup does not contain expected application data.");
  } finally {
    database.close();
  }
}

async function encryptDatabase(source, destination) {
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const output = createWriteStream(destination, { flags: "wx", mode: 0o600 });
  output.write(Buffer.concat([magic, iv]));
  await pipeline(createReadStream(source), cipher, output);
  await appendFile(destination, cipher.getAuthTag());
}

async function decryptDatabase(source, destination) {
  const sourceStat = await stat(source);
  if (sourceStat.size <= magic.length + ivLength + tagLength) throw new Error("The encrypted backup is truncated.");
  const descriptor = await open(source, "r");
  const header = Buffer.alloc(magic.length + ivLength);
  const tag = Buffer.alloc(tagLength);
  try {
    await descriptor.read(header, 0, header.length, 0);
    await descriptor.read(tag, 0, tag.length, sourceStat.size - tagLength);
  } finally {
    await descriptor.close();
  }
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error("The encrypted backup format is invalid.");

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), header.subarray(magic.length));
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(source, { start: header.length, end: sourceStat.size - tagLength - 1 }),
    decipher,
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
}

async function createBackup(outputArgument) {
  if (!outputArgument) throw new Error("Usage: npm run db:backup -- <output.nvbackup>");
  const source = databasePath();
  const output = resolve(outputArgument);
  await assertMissing(output);
  await mkdir(dirname(output), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "Citizavrexo-backup-"));
  const snapshot = join(temporaryDirectory, "snapshot.db");
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await database.backup(snapshot);
    verifyDatabase(snapshot);
    await encryptDatabase(snapshot, output);
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally {
    database.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  console.log(`Encrypted backup created: ${basename(output)}`);
}

async function verifyBackup(inputArgument) {
  if (!inputArgument) throw new Error("Usage: npm run db:backup:verify -- <input.nvbackup>");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "Citizavrexo-verify-"));
  const restored = join(temporaryDirectory, "restored.db");
  try {
    await decryptDatabase(resolve(inputArgument), restored);
    verifyDatabase(restored);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  console.log("Encrypted backup verification passed.");
}

async function restoreBackup(inputArgument, outputArgument) {
  if (!inputArgument || !outputArgument) throw new Error("Usage: npm run db:restore -- <input.nvbackup> <new-database.db>");
  const input = resolve(inputArgument);
  const output = resolve(outputArgument);
  await assertMissing(output);
  await mkdir(dirname(output), { recursive: true });
  const partial = `${output}.partial`;
  await rm(partial, { force: true });
  try {
    await decryptDatabase(input, partial);
    verifyDatabase(partial);
    await rename(partial, output);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  console.log(`Verified database restored: ${basename(output)}`);
}

const [command, ...arguments_] = process.argv.slice(2);
try {
  if (command === "create") await createBackup(arguments_[0]);
  else if (command === "verify") await verifyBackup(arguments_[0]);
  else if (command === "restore") await restoreBackup(arguments_[0], arguments_[1]);
  else throw new Error("Use create, verify, or restore.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database backup operation failed.");
  process.exitCode = 1;
}
