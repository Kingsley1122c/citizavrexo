import "server-only";

import { redirect } from "next/navigation";
import { appendAuditEvent } from "@/lib/audit/audit-service";
import { hasPermission, type Permission } from "./permissions";
import { getAuthenticatedUser } from "./session-service";

export async function requireUser() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/login?error=account_unavailable");
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!hasPermission(user.adminRole, permission)) {
    await appendAuditEvent({ actorId: user.id, actorLabel: user.email, action: "authorization.denied", target: permission, result: "denied" });
    redirect("/app");
  }
  return user;
}