const ephemeralDatabaseUrl = "file:/tmp/citizavrexo/Citizavrexo.db";
const ephemeralProfileImageDirectory = "/tmp/citizavrexo/profile-images";

export type StorageConfiguration = {
  mode: "ephemeral" | "persistent";
  databaseUrl: string;
  profileImageDirectory: string;
};

export function resolveStorageConfiguration(environment: Partial<NodeJS.ProcessEnv> = process.env): StorageConfiguration {
  const mode = environment.STORAGE_MODE ?? "persistent";
  if (mode !== "ephemeral" && mode !== "persistent") throw new Error("STORAGE_MODE must be ephemeral or persistent.");

  const configuredDatabaseUrl = environment.DATABASE_URL ?? "file:./data/Citizavrexo.db";
  const databaseUrl = configuredDatabaseUrl.startsWith("file:") || mode === "ephemeral" ? configuredDatabaseUrl : `file:${configuredDatabaseUrl}`;
  if (!databaseUrl.startsWith("file:")) throw new Error("DATABASE_URL must use the file: scheme for SQLite.");
  const profileImageDirectory = environment.PROFILE_IMAGE_DIR ?? "./data/profile-images";

  if (mode === "ephemeral" && (databaseUrl !== ephemeralDatabaseUrl || profileImageDirectory !== ephemeralProfileImageDirectory)) {
    throw new Error("Ephemeral storage must use the approved /tmp/citizavrexo paths.");
  }

  return { mode, databaseUrl, profileImageDirectory };
}
