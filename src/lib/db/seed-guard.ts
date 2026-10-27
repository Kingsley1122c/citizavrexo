import { resolve } from "node:path";

export function assertDevelopmentSeedEnvironment(environment = process.env.NODE_ENV): void {
  if (environment === "production") throw new Error("Development database seeding is disabled in production.");
}

export function assertQaFixtureEnvironment(environment: NodeJS.ProcessEnv = process.env): string {
  assertDevelopmentSeedEnvironment(environment.NODE_ENV);
  if (environment.QA_FIXTURE_MODE !== "local-only" || environment.RENDER) throw new Error("QA fixtures require an explicit local-only environment.");
  if (environment.APP_URL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(environment.APP_URL)) throw new Error("QA fixtures require a localhost application URL.");
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl?.startsWith("file:")) throw new Error("QA fixtures require an explicit SQLite file URL.");
  const databasePath = resolve(databaseUrl.slice("file:".length));
  if (databasePath !== resolve("data/nivora-qa.db") || /[\\/]var[\\/]data[\\/]/i.test(databasePath)) throw new Error("QA fixtures may only target data/nivora-qa.db.");
  return databasePath;
}