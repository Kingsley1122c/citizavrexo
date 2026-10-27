import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { auditEvents, emailOutbox, notifications, userProfiles, users } from "@/lib/db/schema";
import type { AdminRole, UserProfile } from "@/lib/domain";
import { userUi } from "@/lib/i18n/user-ui";

const textField = z.string().trim().min(2).max(120).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const profileSchema = z.object({
  legalName: textField,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  residentialAddress: z.string().trim().min(5).max(180).regex(/^[^\p{Cc}\p{Cf}]+$/u),
  city: textField,
  stateProvince: textField,
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  postalCode: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9 -]+$/),
  phoneNumber: z.string().trim().min(7).max(20).regex(/^\+[1-9]\d{6,19}$/),
}).strict();

const requiredKeys = ["legalName", "dateOfBirth", "residentialAddress", "city", "stateProvince", "country", "postalCode", "phoneNumber"] as const;
export type ProfileFieldName = (typeof requiredKeys)[number];
export type ProfileFieldErrors = Partial<Record<ProfileFieldName, string>>;

const profileFieldMessages: Record<ProfileFieldName, string> = {
  legalName: "Enter your legal name.",
  dateOfBirth: "Enter a valid date of birth.",
  residentialAddress: "Enter your current residential address.",
  city: "Enter your city.",
  stateProvince: "Enter your state or province.",
  country: "Enter a valid two-letter country code.",
  postalCode: "Enter a valid postal code.",
  phoneNumber: "Enter a phone number in international format, for example +14155552671.",
};

export class ProfileError extends Error {
  constructor(message: string, readonly fieldErrors: ProfileFieldErrors = {}) {
    super(message);
  }
}

type ProfileRow = Partial<Record<(typeof requiredKeys)[number], string | null>> & Partial<Pick<typeof userProfiles.$inferSelect, "reviewStatus" | "reviewedBy" | "reviewedAt" | "rejectionReason">>;

export function profileSummary(row?: ProfileRow): UserProfile {
  const completedFields = requiredKeys.filter((key) => Boolean(row?.[key]?.trim())).length;
  return { ...Object.fromEntries(requiredKeys.map((key) => [key, row?.[key] ?? undefined])), completedFields, requiredFields: requiredKeys.length, completionPercent: Math.round(completedFields / requiredKeys.length * 100), complete: completedFields === requiredKeys.length, reviewStatus: row?.reviewStatus ?? "incomplete", reviewedBy: row?.reviewedBy ?? undefined, reviewedAt: row?.reviewedAt ?? undefined, rejectionReason: row?.rejectionReason ?? undefined } as UserProfile;
}

export function saveUserProfile(userId: string, values: unknown): UserProfile {
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: ProfileFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && field in profileFieldMessages) {
        fieldErrors[field as ProfileFieldName] = profileFieldMessages[field as ProfileFieldName];
      }
    }
    throw new ProfileError("Correct the highlighted profile fields and try again.", fieldErrors);
  }
  const birth = new Date(`${parsed.data.dateOfBirth}T00:00:00Z`);
  const today = new Date();
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== parsed.data.dateOfBirth || birth >= today) {
    throw new ProfileError("Enter a valid date of birth.", { dateOfBirth: profileFieldMessages.dateOfBirth });
  }
  const owner = db.select({ id: users.id, name: users.name, email: users.email, locale: users.locale, status: users.status }).from(users).where(eq(users.id, userId)).get();
  if (!owner || owner.status !== "active") throw new ProfileError("The profile cannot be updated.");
  const now = new Date().toISOString();
  const eventReference = `PROFILE-${userId}-submitted-${randomUUID()}`;
  const submittedMessage = userUi(owner.locale).profileCompletion.submittedMessage;
  db.transaction((tx) => {
    tx.insert(userProfiles).values({ userId, ...parsed.data, reviewStatus: "pending_review", reviewedBy: null, reviewedAt: null, rejectionReason: null, updatedAt: now }).onConflictDoUpdate({ target: userProfiles.userId, set: { ...parsed.data, reviewStatus: "pending_review", reviewedBy: null, reviewedAt: null, rejectionReason: null, updatedAt: now } }).run();
    tx.insert(notifications).values({ id: randomUUID(), userId, kind: "system", title: submittedMessage, message: submittedMessage, eventReference, important: true, createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: randomUUID(), recipient: owner.email, event: "important_account_notification", eventReference, payloadJson: JSON.stringify({ to: owner.email, locale: owner.locale, event: "important_account_notification", eventReference, displayName: owner.name, summary: submittedMessage }), status: "pending", createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: userId, actorLabel: owner.email, action: "profile.submitted", target: userId, result: "success", metadataJson: "{}", timestamp: now }).run();
  });
  return profileSummary({ ...parsed.data, reviewStatus: "pending_review" });
}

export function getUserProfile(userId: string): UserProfile {
  return profileSummary(db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).get());
}

export function reviewUserProfile(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; userId: string; decision: "approved" | "rejected"; rejectionReason?: string }): void {
  if (!hasPermission(input.actorRole, "profiles.review")) throw new ProfileError("Profile review is not permitted.");
  const reason = input.rejectionReason?.trim();
  if (input.decision === "rejected" && (!reason || reason.length < 3 || reason.length > 240)) throw new ProfileError("Provide a valid rejection reason.");
  db.transaction((tx) => {
    const record = tx.select({ profile: userProfiles, user: users }).from(userProfiles).innerJoin(users, eq(userProfiles.userId, users.id)).where(and(eq(userProfiles.userId, input.userId), eq(userProfiles.reviewStatus, "pending_review"))).get();
    if (!record || record.user.status !== "active" || record.user.adminRole) throw new ProfileError("This profile is not available for review.");
    const now = new Date().toISOString();
    const updated = tx.update(userProfiles).set({ reviewStatus: input.decision, reviewedBy: input.actorId, reviewedAt: now, rejectionReason: input.decision === "rejected" ? reason : null, updatedAt: now }).where(and(eq(userProfiles.userId, input.userId), eq(userProfiles.reviewStatus, "pending_review"))).run();
    if (updated.changes !== 1) throw new ProfileError("This profile was already reviewed.");
    const eventReference = `PROFILE-${input.userId}-${input.decision}-${now}`;
    const t = userUi(record.user.locale);
    const summary = input.decision === "approved" ? t.profileCompletion.approvedMessage : `${t.profileCompletion.rejectedMessage} ${reason}`;
    tx.insert(notifications).values({ id: randomUUID(), userId: input.userId, kind: "system", title: summary, message: summary, eventReference, important: true, createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: randomUUID(), recipient: record.user.email, event: "important_account_notification", eventReference, payloadJson: JSON.stringify({ to: record.user.email, locale: record.user.locale, event: "important_account_notification", eventReference, displayName: record.user.name, summary }), status: "pending", createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.actorId, actorLabel: input.actorLabel, action: `profile.${input.decision}`, target: input.userId, result: "success", metadataJson: JSON.stringify({ userId: input.userId, reason: reason ?? "" }), timestamp: now }).run();
  });
}