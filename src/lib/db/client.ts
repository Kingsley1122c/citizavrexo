import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveStorageConfiguration } from "@/lib/storage-policy";
import * as schema from "./schema";

const databasePath = resolveStorageConfiguration().databaseUrl.slice("file:".length);
const globalDatabase = globalThis as typeof globalThis & { CitizavrexoDatabase?: Database.Database };
mkdirSync(dirname(databasePath), { recursive: true });
const sqlite = globalDatabase.CitizavrexoDatabase ?? new Database(databasePath);

sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
if (process.env.NODE_ENV !== "production") globalDatabase.CitizavrexoDatabase = sqlite;

export const db = drizzle(sqlite, { schema });
export type CitizavrexoDatabase = typeof db;

export function closeDatabaseConnection() {
	if (sqlite.open) sqlite.close();
	delete globalDatabase.CitizavrexoDatabase;
}
