import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { emailOutbox, notifications } from "@/lib/db/schema";
import type { NotificationKind } from "@/lib/domain";
import { safeEmailPayloadSchema, type EmailEvent } from "./email-service";
import type { Locale } from "@/lib/i18n/config";

type EventWriter = Pick<typeof db, "insert">;

type UserEventInput = {
  userId: string;
  email: string;
  displayName: string;
  locale: Locale;
  kind: NotificationKind;
  title: string;
  message: string;
  emailEvent: EmailEvent;
  eventKey: string;
  notificationEventKey?: string;
  emailEventKey?: string;
  publicReference: string;
  emailSummary: string;
  important: boolean;
  createdAt: string;
};

export function persistUserEvent(writer: EventWriter, input: UserEventInput): void {
  const payload = safeEmailPayloadSchema.parse({ to: input.email, locale: input.locale, event: input.emailEvent, eventReference: input.publicReference, displayName: input.displayName, summary: input.emailSummary });
  writer.insert(notifications).values({ id: randomUUID(), userId: input.userId, kind: input.kind, title: input.title, message: input.message, eventReference: input.notificationEventKey ?? input.eventKey, important: input.important, createdAt: input.createdAt }).onConflictDoNothing().run();
  writer.insert(emailOutbox).values({ id: randomUUID(), recipient: input.email, event: input.emailEvent, eventReference: input.emailEventKey ?? input.eventKey, payloadJson: JSON.stringify(payload), status: "pending", createdAt: input.createdAt }).onConflictDoNothing().run();
}
