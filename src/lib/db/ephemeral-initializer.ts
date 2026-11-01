import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hash } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { z } from "zod";
import { auditEvents, credentials, users } from "./schema";
import { passwordSchema } from "../auth/password-policy";

const administratorSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u),
  password: passwordSchema,
});

type InitializeEphemeralDatabaseInput = {
  databasePath: string;
  profileImageDirectory: string;
  migrationsFolder: string;
  administrator?: z.input<typeof administratorSchema>;
  storageMode?: "ephemeral" | "persistent";
};

export async function initializeEphemeralDatabase(input: InitializeEphemeralDatabaseInput): Promise<{ administratorCreated: boolean }> {
  mkdirSync(dirname(resolve(input.databasePath)), { recursive: true });
  mkdirSync(resolve(input.profileImageDirectory), { recursive: true });

  const sqlite = new Database(input.databasePath);
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite);
  try {
    if (input.storageMode === "persistent" && existsSync(input.databasePath) && sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master").get()) {
      const backupDirectory = resolve(dirname(input.databasePath), "backups");
      mkdirSync(backupDirectory, { recursive: true });
      const backupPath = resolve(backupDirectory, `pre-migration-${new Date().toISOString().replaceAll(":", "-")}.db`);
      await sqlite.backup(backupPath);
      const oldBackups = readdirSync(backupDirectory)
        .filter((name) => /^pre-migration-.*\.db$/.test(name))
        .sort()
        .slice(0, -5);
      for (const name of oldBackups) rmSync(resolve(backupDirectory, name), { force: true });
    }
    migrate(database, { migrationsFolder: input.migrationsFolder });
    if (database.select({ id: users.id }).from(users).where(isNotNull(users.adminRole)).limit(1).get()) {
      return { administratorCreated: false };
    }

    if (!input.administrator) throw new Error("Administrator bootstrap values are required for an empty database.");
    const administrator = administratorSchema.parse(input.administrator);

    const email = administrator.email.toLowerCase();
    if (database.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1).get()) {
      throw new Error("The ephemeral administrator identity conflicts with an existing user.");
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const initials = administrator.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
    const passwordHash = await hash(administrator.password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    database.transaction((tx) => {
      tx.insert(users).values({ id, name: administrator.name, email, avatarInitials: initials, status: "active", emailVerifiedAt: now, locale: "en", adminRole: "super_admin", createdAt: now, updatedAt: now }).run();
      tx.insert(credentials).values({ userId: id, passwordHash, passwordChangedAt: now }).run();
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: id, actorLabel: email, action: "admin.bootstrap", target: id, result: "success", metadataJson: JSON.stringify({ storageMode: input.storageMode ?? "ephemeral" }), timestamp: now }).run();
    });
    return { administratorCreated: true };
  } finally {
    sqlite.close();
  }
}
