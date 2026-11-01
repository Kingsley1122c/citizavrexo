import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import { auditEvents, credentials, users } from "../src/lib/db/schema";

const sqlite = new Database(process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/Citizavrexo.db");
sqlite.pragma("foreign_keys = ON");
const database = drizzle(sqlite);

const inputSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u),
  password: z.string().min(12).max(128),
});

async function bootstrapAdmin() {
  const input = inputSchema.parse({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    name: process.env.BOOTSTRAP_ADMIN_NAME,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  });
  const email = input.email.toLowerCase();
  const initials = input.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const existingAdmin = database.select({ id: users.id }).from(users).where(isNotNull(users.adminRole)).limit(1).get();
  if (existingAdmin) throw new Error("An administrator already exists; bootstrap was not applied.");
  if (database.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1).get()) {
    throw new Error("The bootstrap email is already in use.");
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hash(input.password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  database.transaction((tx) => {
    tx.insert(users).values({ id, name: input.name, email, avatarInitials: initials, status: "active", emailVerifiedAt: now, locale: "en", adminRole: "super_admin", createdAt: now, updatedAt: now }).run();
    tx.insert(credentials).values({ userId: id, passwordHash, passwordChangedAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: id, actorLabel: email, action: "admin.bootstrap", target: id, result: "success", metadataJson: "{}", timestamp: now }).run();
  });
  sqlite.close();

  console.log("Initial production administrator created. Remove the BOOTSTRAP_ADMIN_* environment variables now.");
}

bootstrapAdmin().catch((error: unknown) => {
  if (sqlite.open) sqlite.close();
  console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
  process.exitCode = 1;
});

