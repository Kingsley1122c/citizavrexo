import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const databasePath = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/nivora.db";
const globalDatabase = globalThis as typeof globalThis & { nivoraDatabase?: Database.Database };
mkdirSync(dirname(databasePath), { recursive: true });
const sqlite = globalDatabase.nivoraDatabase ?? new Database(databasePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
if (process.env.NODE_ENV !== "production") globalDatabase.nivoraDatabase = sqlite;

export const db = drizzle(sqlite, { schema });
export type NivoraDatabase = typeof db;

export function closeDatabaseConnection() {
	if (sqlite.open) sqlite.close();
	delete globalDatabase.nivoraDatabase;
}