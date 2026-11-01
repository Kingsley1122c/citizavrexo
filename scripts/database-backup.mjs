import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, appendFile, copyFile, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import * as tar from "tar";

const legacyMagic = Buffer.from("NVBKUP01", "ascii");
const bundleMagic = Buffer.from("NVBKUP02", "ascii");
const ivLength = 12;
const tagLength = 16;
const imageNamePattern = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const requiredTables = [
  "accounts", "admin_credits", "administrator_transfers", "audit_events", "authentication_tokens",
  "auth_rate_limits", "bank_destinations", "card_requests", "cards", "credentials", "devices",
  "email_outbox", "internal_transfers", "notifications", "recovery_codes", "recovery_requests", "sessions",
  "transactions", "users", "user_profiles", "user_status_changes", "withdrawal_requests",
];

function encryptionKey() {
  const encoded = process.env.BACKUP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("BACKUP_ENCRYPTION_KEY is required.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("BACKUP_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.");
  return key;
}

function databasePath(value = process.env.DATABASE_URL) {
  if (!value?.startsWith("file:")) throw new Error("DATABASE_URL must use the file: scheme.");
  return resolve(value.slice("file:".length));
}

function profileImagePath() {
  return resolve(process.env.PROFILE_IMAGE_DIR || join(dirname(databasePath()), "profile-images"));
}

async function assertMissing(path) {
  try {
    await access(path);
    throw new Error(`The destination already exists; refusing to overwrite it: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function verifyDatabase(path) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("SQLite integrity checking failed.");
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

async function checksum(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function encryptFile(source, destination, magic = bundleMagic) {
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const output = createWriteStream(destination, { flags: "wx", mode: 0o600 });
  output.write(Buffer.concat([magic, iv]));
  await pipeline(createReadStream(source), cipher, output);
  await appendFile(destination, cipher.getAuthTag());
}

async function decryptFile(source, destination) {
  const sourceStat = await stat(source);
  if (sourceStat.size <= bundleMagic.length + ivLength + tagLength) throw new Error("The encrypted backup is truncated.");
  const descriptor = await open(source, "r");
  const header = Buffer.alloc(bundleMagic.length + ivLength);
  const tag = Buffer.alloc(tagLength);
  try {
    await descriptor.read(header, 0, header.length, 0);
    await descriptor.read(tag, 0, tag.length, sourceStat.size - tagLength);
  } finally {
    await descriptor.close();
  }
  const magic = header.subarray(0, bundleMagic.length);
  const version = magic.equals(bundleMagic) ? 2 : magic.equals(legacyMagic) ? 1 : 0;
  if (!version) throw new Error("The encrypted backup format is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), header.subarray(bundleMagic.length));
  decipher.setAuthTag(tag);
  await pipeline(createReadStream(source, { start: header.length, end: sourceStat.size - tagLength - 1 }), decipher, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
  return version;
}

async function buildBundle(sourceDatabase, sourceImages, workingDirectory) {
  const contents = join(workingDirectory, "contents");
  const images = join(contents, "profile-images");
  const snapshot = join(contents, "database.sqlite");
  await mkdir(images, { recursive: true });
  const database = new Database(sourceDatabase, { readonly: true, fileMustExist: true });
  try {
    await database.backup(snapshot);
  } finally {
    database.close();
  }
  verifyDatabase(snapshot);
  let entries = [];
  try {
    entries = await readdir(sourceImages, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !imageNamePattern.test(entry.name)) throw new Error(`Unexpected profile-image entry: ${entry.name}`);
    await copyFile(join(sourceImages, entry.name), join(images, entry.name));
  }
  const referenceDatabase = new Database(snapshot, { readonly: true });
  const referencedImages = referenceDatabase.prepare("SELECT profile_image_key AS name FROM users WHERE profile_image_key IS NOT NULL").all();
  referenceDatabase.close();
  const imageNames = new Set(entries.map((entry) => entry.name));
  if (referencedImages.some(({ name }) => !imageNames.has(name))) throw new Error("A database-referenced profile image is missing from storage.");
  const files = [{ path: "database.sqlite", size: (await stat(snapshot)).size, sha256: await checksum(snapshot) }];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(images, entry.name);
    files.push({ path: `profile-images/${entry.name}`, size: (await stat(path)).size, sha256: await checksum(path) });
  }
  await writeFile(join(contents, "manifest.json"), `${JSON.stringify({ version: 2, createdAt: new Date().toISOString(), files }, null, 2)}\n`, { mode: 0o600 });
  const archive = join(workingDirectory, "bundle.tar");
  await tar.create({ cwd: contents, file: archive, portable: true, noMtime: true }, ["manifest.json", "database.sqlite", "profile-images"]);
  return archive;
}

async function extractAndVerifyBundle(archive, destination) {
  await mkdir(destination, { recursive: true });
  await tar.extract({ cwd: destination, file: archive, strict: true, preservePaths: false, filter: (path, entry) => {
    const allowed = path === "manifest.json" || path === "database.sqlite" || path === "profile-images/" || /^profile-images\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(path);
    if (!allowed || !["File", "Directory"].includes(entry.type)) throw new Error(`Invalid backup bundle entry: ${path}`);
    return true;
  } });
  const manifest = JSON.parse(await readFile(join(destination, "manifest.json"), "utf8"));
  if (manifest.version !== 2 || !Array.isArray(manifest.files)) throw new Error("The backup manifest is invalid.");
  const expectedPaths = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== "string" || !/^(?:database\.sqlite|profile-images\/[0-9a-f-]{36}\.(?:jpg|png|webp))$/.test(file.path) || expectedPaths.has(file.path)) throw new Error("The backup manifest contains an invalid path.");
    expectedPaths.add(file.path);
    const path = join(destination, ...file.path.split("/"));
    const details = await stat(path);
    if (!details.isFile() || details.size !== file.size || await checksum(path) !== file.sha256) throw new Error(`Backup checksum verification failed: ${file.path}`);
  }
  if (!expectedPaths.has("database.sqlite")) throw new Error("The backup manifest does not contain the database.");
  const actualImages = await readdir(join(destination, "profile-images"));
  if (actualImages.some((name) => !expectedPaths.has(`profile-images/${name}`)) || manifest.files.length !== actualImages.length + 1) throw new Error("The backup bundle contains unverified files.");
  verifyDatabase(join(destination, "database.sqlite"));
}

async function createBackup(outputArgument) {
  if (!outputArgument) throw new Error("Usage: npm run db:backup -- <output.nvbackup>");
  const output = resolve(outputArgument);
  await assertMissing(output);
  await mkdir(dirname(output), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "Citizavrexo-backup-"));
  try {
    const archive = await buildBundle(databasePath(), profileImagePath(), temporaryDirectory);
    await encryptFile(archive, output);
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  console.log(`Encrypted database and profile-image backup created: ${basename(output)}`);
}

async function inspectBackup(inputArgument, operation) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `Citizavrexo-${operation}-`));
  try {
    const decrypted = join(temporaryDirectory, "decrypted");
    const version = await decryptFile(resolve(inputArgument), decrypted);
    if (version === 1) verifyDatabase(decrypted);
    else await extractAndVerifyBundle(decrypted, join(temporaryDirectory, "restored"));
    return { temporaryDirectory, version, restored: version === 1 ? decrypted : join(temporaryDirectory, "restored") };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function verifyBackup(inputArgument) {
  if (!inputArgument) throw new Error("Usage: npm run db:backup:verify -- <input.nvbackup>");
  const inspection = await inspectBackup(inputArgument, "verify");
  await rm(inspection.temporaryDirectory, { recursive: true, force: true });
  console.log("Encrypted backup verification passed.");
}

async function restoreBackup(inputArgument, databaseArgument, imagesArgument) {
  if (!inputArgument || !databaseArgument) throw new Error("Usage: npm run db:restore -- <input.nvbackup> <new-database.db> [new-profile-images-directory]");
  const databaseOutput = resolve(databaseArgument);
  await assertMissing(databaseOutput);
  await mkdir(dirname(databaseOutput), { recursive: true });
  const inspection = await inspectBackup(inputArgument, "restore");
  try {
    if (inspection.version === 1) {
      await rename(inspection.restored, databaseOutput);
    } else {
      if (!imagesArgument) throw new Error("A profile-image destination is required for version 2 backups.");
      const imagesOutput = resolve(imagesArgument);
      await assertMissing(imagesOutput);
      await mkdir(dirname(imagesOutput), { recursive: true });
      await rename(join(inspection.restored, "profile-images"), imagesOutput);
      try {
        await rename(join(inspection.restored, "database.sqlite"), databaseOutput);
      } catch (error) {
        await rename(imagesOutput, join(inspection.restored, "profile-images")).catch(() => undefined);
        throw error;
      }
    }
  } finally {
    await rm(inspection.temporaryDirectory, { recursive: true, force: true });
  }
  console.log(`Verified backup restored: ${basename(databaseOutput)}`);
}

const [command, ...arguments_] = process.argv.slice(2);
try {
  if (command === "create") await createBackup(arguments_[0]);
  else if (command === "verify") await verifyBackup(arguments_[0]);
  else if (command === "restore") await restoreBackup(arguments_[0], arguments_[1], arguments_[2]);
  else throw new Error("Use create, verify, or restore.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database backup operation failed.");
  process.exitCode = 1;
}