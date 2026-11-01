import "server-only";

import type { AdminRole } from "@/lib/domain";

export type Permission = "admin.dashboard.read" | "admin.ownership.transfer" | "users.read" | "users.suspend" | "users.delete" | "profiles.review" | "accounts.read" | "accounts.credit" | "accounts.currency.review" | "transactions.read" | "transactions.authorize" | "cards.review" | "withdrawals.review" | "notifications.manage" | "recovery.read" | "recovery.review" | "security.read" | "reports.read" | "audit.read" | "settings.manage";

const policies: Record<AdminRole, readonly Permission[]> = {
  super_admin: ["admin.dashboard.read", "admin.ownership.transfer", "users.read", "users.suspend", "users.delete", "profiles.review", "accounts.read", "accounts.credit", "accounts.currency.review", "transactions.read", "transactions.authorize", "cards.review", "withdrawals.review", "notifications.manage", "recovery.read", "recovery.review", "security.read", "reports.read", "audit.read", "settings.manage"],
  administrator: ["admin.dashboard.read", "users.read", "users.suspend", "profiles.review", "accounts.read", "accounts.credit", "accounts.currency.review", "transactions.read", "transactions.authorize", "cards.review", "withdrawals.review", "notifications.manage", "recovery.read", "recovery.review", "security.read", "reports.read", "audit.read"],
  support_agent: ["admin.dashboard.read", "users.read", "accounts.read", "transactions.read", "recovery.read", "recovery.review", "security.read"],
  auditor: ["admin.dashboard.read", "users.read", "accounts.read", "transactions.read", "recovery.read", "security.read", "reports.read", "audit.read"],
};

export function hasPermission(role: AdminRole | null, permission: Permission): boolean {
  return role ? policies[role].includes(permission) : false;
}

export function permissionsFor(role: AdminRole): readonly Permission[] {
  return policies[role];
}