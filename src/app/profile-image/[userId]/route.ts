import { eq } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth/session-service";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { readProfileImage } from "@/lib/users/profile-image-service";

export async function GET(_: Request, context: { params: Promise<{ userId: string }> }) {
  const identity = await getAuthenticatedUser();
  if (!identity) return new Response(null, { status: 401 });
  if (identity.status !== "active") return new Response(null, { status: 403 });
  const { userId } = await context.params;
  if (identity.id !== userId && !hasPermission(identity.adminRole, "users.read")) return new Response(null, { status: 403 });
  const user = db.select({ key: users.profileImageKey }).from(users).where(eq(users.id, userId)).get();
  if (!user?.key) return new Response(null, { status: 404 });
  const image = await readProfileImage(user.key);
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image.bytes), { headers: { "Content-Type": image.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}