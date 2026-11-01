import { describe, expect, it } from "vitest";
import { resolveStorageConfiguration } from "./storage-policy";

describe("storage policy", () => {
  it("uses existing local paths when no storage mode is configured", () => {
    expect(resolveStorageConfiguration({})).toEqual({
      mode: "persistent",
      databaseUrl: "file:./data/Citizavrexo.db",
      profileImageDirectory: "./data/profile-images",
    });
  });

  it("normalizes the existing bare SQLite path convention outside ephemeral mode", () => {
    expect(resolveStorageConfiguration({ DATABASE_URL: "./data/test.db" }).databaseUrl).toBe("file:./data/test.db");
  });

  it("accepts only the approved ephemeral paths", () => {
    expect(resolveStorageConfiguration({
      STORAGE_MODE: "ephemeral",
      DATABASE_URL: "file:/tmp/citizavrexo/Citizavrexo.db",
      PROFILE_IMAGE_DIR: "/tmp/citizavrexo/profile-images",
    })).toEqual({
      mode: "ephemeral",
      databaseUrl: "file:/tmp/citizavrexo/Citizavrexo.db",
      profileImageDirectory: "/tmp/citizavrexo/profile-images",
    });
  });

  it("rejects an ephemeral database or image directory outside the approved root", () => {
    expect(() => resolveStorageConfiguration({ STORAGE_MODE: "ephemeral" })).toThrow("approved /tmp/citizavrexo paths");
    expect(() => resolveStorageConfiguration({
      STORAGE_MODE: "ephemeral",
      DATABASE_URL: "file:/tmp/citizavrexo/Citizavrexo.db",
      PROFILE_IMAGE_DIR: "/var/data/profile-images",
    })).toThrow("approved /tmp/citizavrexo paths");
  });
});