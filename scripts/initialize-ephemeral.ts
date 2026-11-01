import { resolve } from "node:path";
import { initializeEphemeralDatabase } from "../src/lib/db/ephemeral-initializer";
import { requireRecoveryCodePepper } from "../src/lib/security/runtime-secrets";
import { resolveStorageConfiguration } from "../src/lib/storage-policy";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for ephemeral initialization.`);
  return value;
}

async function main(): Promise<void> {
  requireRecoveryCodePepper();
  const storage = resolveStorageConfiguration();
  if (storage.mode !== "ephemeral") throw new Error("The free-service initializer requires STORAGE_MODE=ephemeral.");

  await initializeEphemeralDatabase({
    databasePath: storage.databaseUrl.slice("file:".length),
    profileImageDirectory: storage.profileImageDirectory,
    migrationsFolder: resolve("drizzle"),
    administrator: {
      email: requireEnvironmentVariable("EPHEMERAL_ADMIN_EMAIL"),
      name: requireEnvironmentVariable("EPHEMERAL_ADMIN_NAME"),
      password: requireEnvironmentVariable("EPHEMERAL_ADMIN_PASSWORD"),
    },
  });

  console.log("Ephemeral storage initialized. All runtime records reset when the service filesystem resets.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Ephemeral initialization failed.");
  process.exitCode = 1;
});
