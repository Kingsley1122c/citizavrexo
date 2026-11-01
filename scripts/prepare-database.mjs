import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/Citizavrexo.db";
if (!databaseUrl.startsWith("file:")) {
  throw new Error("DATABASE_URL must use the file: scheme for SQLite.");
}

const databasePath = databaseUrl.slice("file:".length);
mkdirSync(dirname(resolve(databasePath)), { recursive: true });

