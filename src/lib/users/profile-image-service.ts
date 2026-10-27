import "server-only";

import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents, users } from "@/lib/db/schema";

const maximumBytes = 2 * 1024 * 1024;
const keyPattern = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

export class ProfileImageError extends Error {}

function imageType(bytes: Uint8Array): { extension: "jpg" | "png" | "webp"; contentType: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", contentType: "image/jpeg" };
  if (bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return { extension: "png", contentType: "image/png" };
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { extension: "webp", contentType: "image/webp" };
  return null;
}

function storageDirectory() {
  return resolve(/* turbopackIgnore: true */ process.env.PROFILE_IMAGE_DIR ?? "./data/profile-images");
}

export async function saveProfileImage(input: { userId: string; actorLabel: string; file: File }): Promise<void> {
  if (input.file.size <= 0 || input.file.size > maximumBytes) throw new ProfileImageError("Choose an image smaller than 2 MB.");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const detected = imageType(bytes);
  if (!detected) throw new ProfileImageError("Choose a JPEG, PNG, or WebP image.");
  const key = `${randomUUID()}.${detected.extension}`;
  const directory = storageDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, key), bytes, { flag: "wx", mode: 0o600 });
  const current = db.select({ profileImageKey: users.profileImageKey }).from(users).where(and(eq(users.id, input.userId), eq(users.status, "active"))).get();
  if (!current) {
    await unlink(resolve(directory, key)).catch(() => undefined);
    throw new ProfileImageError("Your profile is not available.");
  }
  const now = new Date().toISOString();
  try {
    db.transaction((tx) => {
      const update = tx.update(users).set({ profileImageKey: key, profileImageUpdatedAt: now, updatedAt: now }).where(and(eq(users.id, input.userId), eq(users.status, "active"))).run();
      if (update.changes !== 1) throw new ProfileImageError("Your profile changed. Try again.");
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "profile_image.update", target: input.userId, result: "success", metadataJson: JSON.stringify({ contentType: detected.contentType, size: String(bytes.byteLength) }), timestamp: now }).run();
    });
  } catch (error) {
    await unlink(resolve(directory, key)).catch(() => undefined);
    throw error;
  }
  if (current.profileImageKey && keyPattern.test(current.profileImageKey)) await unlink(resolve(directory, current.profileImageKey)).catch(() => undefined);
}

export async function readProfileImage(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!keyPattern.test(key)) return null;
  try {
    const bytes = await readFile(/* turbopackIgnore: true */ resolve(storageDirectory(), key));
    const detected = imageType(bytes);
    return detected ? { bytes, contentType: detected.contentType } : null;
  } catch {
    return null;
  }
}

export async function deleteProfileImageFile(key: string | null): Promise<void> {
  if (key && keyPattern.test(key)) await unlink(resolve(storageDirectory(), key)).catch(() => undefined);
}

export function deleteProfileImageFileSync(key: string | null): void {
  if (!key || !keyPattern.test(key)) return;
  try { unlinkSync(resolve(storageDirectory(), key)); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}