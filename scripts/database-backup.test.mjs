import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { expiredBackupKeys, resolveOffsiteConfiguration, runOffsiteBackup } from "./offsite-backup.mjs";

const directory = mkdtempSync(join(tmpdir(), "Citizavrexo-backup-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function run(command, environment) {
  return execFileSync(process.execPath, ["scripts/database-backup.mjs", ...command], { cwd: process.cwd(), env: { ...process.env, ...environment }, encoding: "utf8" });
}

describe("encrypted backup bundle", () => {
  it("creates, verifies, and restores SQLite and profile images", () => {
    const databasePath = join(directory, "source.db");
    const imagesPath = join(directory, "source-images");
    const imageName = `${randomUUID()}.png`;
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    mkdirSync(imagesPath);
    writeFileSync(join(imagesPath, imageName), imageBytes);
    const database = new Database(databasePath);
    for (const table of ["accounts", "admin_credits", "administrator_transfers", "authentication_tokens", "auth_rate_limits", "bank_destinations", "card_requests", "cards", "credentials", "devices", "email_outbox", "internal_transfers", "notifications", "recovery_codes", "recovery_requests", "sessions", "transactions", "user_profiles", "user_status_changes", "withdrawal_requests"]) database.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
    database.exec("CREATE TABLE users (id TEXT PRIMARY KEY, admin_role TEXT, status TEXT, profile_image_key TEXT)");
    database.exec("CREATE TABLE audit_events (id TEXT PRIMARY KEY)");
    database.prepare("INSERT INTO users VALUES (?, ?, ?, ?)").run("admin", "super_admin", "active", imageName);
    database.prepare("INSERT INTO audit_events VALUES (?)").run("audit-1");
    database.close();

    const backupPath = join(directory, "backup.nvbackup");
    const restoredDatabase = join(directory, "restored.db");
    const restoredImages = join(directory, "restored-images");
    const environment = { DATABASE_URL: `file:${databasePath}`, PROFILE_IMAGE_DIR: imagesPath, BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64") };
    expect(run(["create", backupPath], environment)).toContain("backup created");
    expect(run(["verify", backupPath], environment)).toContain("verification passed");
    expect(run(["restore", backupPath, restoredDatabase, restoredImages], environment)).toContain("backup restored");
    expect(readFileSync(join(restoredImages, imageName))).toEqual(imageBytes);
    const restored = new Database(restoredDatabase, { readonly: true });
    expect(restored.prepare("SELECT profile_image_key FROM users WHERE id = 'admin'").get()).toEqual({ profile_image_key: imageName });
    restored.close();
  });
});

describe("off-site backup policy", () => {
  it("requires a complete destination and validates retention", () => {
    expect(() => resolveOffsiteConfiguration({})).toThrow("configuration is incomplete");
    const environment = {
      BACKUP_S3_ENDPOINT: "https://objects.example.test",
      BACKUP_S3_REGION: "auto",
      BACKUP_S3_BUCKET: "citizavrexo-backups",
      BACKUP_S3_ACCESS_KEY_ID: "test-access-key",
      BACKUP_S3_SECRET_ACCESS_KEY: "test-secret-key",
      BACKUP_RETENTION_DAYS: "35",
    };
    expect(resolveOffsiteConfiguration(environment)).toMatchObject({ prefix: "citizavrexo", retentionDays: 35 });
    expect(() => resolveOffsiteConfiguration({ ...environment, BACKUP_RETENTION_DAYS: "1" })).toThrow("7 through 3650");
  });

  it("expires only old Citizavrexo backup objects", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    const objects = [
      { Key: "citizavrexo/old.nvbackup", LastModified: new Date("2026-09-01T00:00:00.000Z") },
      { Key: "citizavrexo/current.nvbackup", LastModified: new Date("2026-10-15T00:00:00.000Z") },
      { Key: "another-service/old.nvbackup", LastModified: new Date("2026-09-01T00:00:00.000Z") },
    ];
    expect(expiredBackupKeys(objects, "citizavrexo", 35, now)).toEqual(["citizavrexo/old.nvbackup"]);
  });

  it("uploads verified bytes, paginates retention, and writes success only after cleanup", async () => {
    const stateFile = join(directory, "offsite-success.json");
    const environment = {
      BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      BACKUP_S3_ENDPOINT: "https://objects.example.test",
      BACKUP_S3_REGION: "auto",
      BACKUP_S3_BUCKET: "citizavrexo-backups",
      BACKUP_S3_ACCESS_KEY_ID: "test-access-key",
      BACKUP_S3_SECRET_ACCESS_KEY: "test-secret-key",
      BACKUP_STATE_FILE: stateFile,
    };
    const commands = [];
    const client = {
      async send(command) {
        commands.push(command);
        if (command.constructor.name === "ListObjectsV2Command") {
          if (!command.input.ContinuationToken) return { IsTruncated: true, NextContinuationToken: "page-2", Contents: [] };
          return { Contents: [{ Key: "citizavrexo/expired.nvbackup", LastModified: new Date("2020-01-01T00:00:00.000Z") }] };
        }
        return {};
      },
      destroy() {},
    };
    const executeFile = async (_executable, arguments_) => {
      if (arguments_[1] === "create") await writeFile(arguments_[2], "encrypted-test-backup");
    };

    await runOffsiteBackup(environment, { client, executeFile });

    const upload = commands.find((command) => command.constructor.name === "PutObjectCommand");
    const deletion = commands.find((command) => command.constructor.name === "DeleteObjectsCommand");
    expect(upload.input).toMatchObject({ Bucket: environment.BACKUP_S3_BUCKET, ContentType: "application/octet-stream", ContentLength: 21 });
    expect(upload.input.Metadata).toMatchObject({ format: "nvbackup02", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(commands.filter((command) => command.constructor.name === "ListObjectsV2Command")).toHaveLength(2);
    expect(deletion.input.Delete.Objects).toEqual([{ Key: "citizavrexo/expired.nvbackup" }]);
    expect(JSON.parse(await readFile(stateFile, "utf8"))).toMatchObject({ key: upload.input.Key, bytes: 21, sha256: upload.input.Metadata.sha256 });

    await rm(stateFile);
    const failedClient = { send: async () => { throw new Error("upload unavailable"); }, destroy() {} };
    await expect(runOffsiteBackup(environment, { client: failedClient, executeFile })).rejects.toThrow("upload unavailable");
    await expect(access(stateFile)).rejects.toThrow();
  });
});