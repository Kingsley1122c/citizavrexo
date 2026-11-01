import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hash } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { z } from "zod";
import { auditEvents, credentials, users } from "./schema";

const administratorSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u),
  password: z.string().min(12).max(128),
});

type InitializeEphemeralDatabaseInput = {
  databasePath: string;
  profileImageDirectory: string;
  migrationsFolder: string;
  administrator: z.input<typeof administratorSchema>;
};

export async function initializeEphemeralDatabase(input: InitializeEphemeralDatabaseInput): Promise<{ administratorCreated: boolean }> {
  const administrator = administratorSchema.parse(input.administrator);
  mkdirSync(dirname(resolve(input.databasePath)), { recursive: true });
  mkdirSync(resolve(input.profileImageDirectory), { recursive: true });

  const sqlite = new Database(input.databasePath);
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite);
  try {
    migrate(database, { migrationsFolder: input.migrationsFolder });
    if (database.select({ id: users.id }).from(users).where(isNotNull(users.adminRole)).limit(1).get()) {
      return { administratorCreated: false };
    }

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
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: id, actorLabel: email, action: "admin.bootstrap", target: id, result: "success", metadataJson: JSON.stringify({ storageMode: "ephemeral" }), timestamp: now }).run();
    });
    return { administratorCreated: true };
  } finally {
    sqlite.close();
  }
}
