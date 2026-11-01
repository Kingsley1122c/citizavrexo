import { describe, expect, it } from "vitest";
import type { Notification } from "@/lib/domain";
import { localizeNotification, userUi } from "./user-ui";

const notification = (overrides: Partial<Notification>): Notification => ({
  id: "notification-1",
  kind: "system",
  title: "Welcome to CITIZAVREXO",
  message: "Your account is verified and ready. Review your profile and security settings to finish setup.",
  createdAt: "2026-10-31T00:00:00.000Z",
  read: false,
  important: true,
  eventReference: "EVENT-1",
  ...overrides,
});

describe("user UI notification localization", () => {
  it.each(["Welcome to CITIZAVREXO", "Welcome to Citizavrexo Core"])(
    "localizes current and legacy welcome titles: %s",
    (title) => {
      expect(localizeNotification("fr", notification({ title })).title).toBe(userUi("fr").notifications.titleWelcome);
    },
  );

  it("uses a valid middle dot in localized transaction messages", () => {
    const credited = localizeNotification("en", notification({
      kind: "credit",
      title: "Money added to your account",
      message: "$1,234.56 was added to your account.",
    }));
    const received = localizeNotification("en", notification({
      kind: "transfer",
      title: "Transfer received",
      message: "$25.00 was received from Amara",
    }));

    expect(credited.message).toContain("$1,234.56 · Money added to your account");
    expect(received.message).toContain("$25.00 · Amara");
    expect(`${credited.message}${received.message}`).not.toContain("┬");
  });
});