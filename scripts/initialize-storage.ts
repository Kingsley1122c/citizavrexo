import { resolve } from "node:path";
import { initializeEphemeralDatabase } from "../src/lib/db/ephemeral-initializer";
import { requireRecoveryCodePepper } from "../src/lib/security/runtime-secrets";
import { resolveStorageConfiguration } from "../src/lib/storage-policy";

function administratorBootstrap() {
  const email = process.env.EPHEMERAL_ADMIN_EMAIL;
  const name = process.env.EPHEMERAL_ADMIN_NAME;
  const password = process.env.EPHEMERAL_ADMIN_PASSWORD;
  if (!email && !name && !password) return undefined;
  if (!email || !name || !password) throw new Error("Administrator bootstrap values must be configured together.");
  return { email, name, password };
}

async function main(): Promise<void> {
  requireRecoveryCodePepper();
  const storage = resolveStorageConfiguration();
  if (storage.mode !== "persistent") throw new Error("Persistent startup requires STORAGE_MODE=persistent.");

  const result = await initializeEphemeralDatabase({
    databasePath: storage.databaseUrl.slice("file:".length),
    profileImageDirectory: storage.profileImageDirectory,
    migrationsFolder: resolve("drizzle"),
    administrator: administratorBootstrap(),
    storageMode: "persistent",
  });

  console.log(result.administratorCreated ? "Persistent storage initialized with the configured administrator." : "Persistent storage migrations completed; existing administrator preserved.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Persistent storage initialization failed.");
  process.exitCode = 1;
});