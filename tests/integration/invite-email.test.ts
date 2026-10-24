import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

const { sendEmail, getEmailProvider } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getEmailProvider: vi.fn(),
}));
vi.mock("@/lib/email", () => ({ sendEmail, getEmailProvider }));

import { sendInviteEmail } from "@/lib/invite-email";

const acceptUrl = "https://alfa.example.com/sign-up?__clerk_ticket=tkt_1";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let inviterId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db, { name: "Acme Ltd" })).id;
  const [inviter] = await db
    .insert(users)
    .values({ companyId, email: "sam@acme.test", name: "Sam", role: "admin" })
    .returning();
  inviterId = inviter.id;
  sendEmail.mockReset().mockResolvedValue({ id: "email_1" });
  getEmailProvider.mockReset().mockReturnValue({ name: "resend" });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("sendInviteEmail", () => {
  it("names the company and inviter, and replies to the inviter", async () => {
    await sendInviteEmail({
      to: "new@example.com",
      acceptUrl,
      expiresInDays: 7,
      context: { companyId, invitedByUserId: inviterId },
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0];
    expect(message).toMatchObject({
      to: "new@example.com",
      subject: "Sam invited you to Acme Ltd on Alfa",
      replyTo: "sam@acme.test",
    });
    expect(message.text).toContain(acceptUrl);
  });

  it("sends a generic invite with no reply-to when there is no inviter", async () => {
    await sendInviteEmail({ to: "ops@example.com", acceptUrl, expiresInDays: 7 });

    const message = sendEmail.mock.calls[0][0];
    expect(message.subject).toBe("You're invited to Alfa");
    expect(message).not.toHaveProperty("replyTo");
  });

  it("logs the accept link only for the console provider", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await sendInviteEmail({ to: "new@example.com", acceptUrl, expiresInDays: 7 });
      expect(info).not.toHaveBeenCalled();

      getEmailProvider.mockReturnValue({ name: "console" });
      await sendInviteEmail({ to: "new@example.com", acceptUrl, expiresInDays: 7 });
      expect(info).toHaveBeenCalledWith(expect.stringContaining(acceptUrl));
    } finally {
      info.mockRestore();
    }
  });

  it("lets a provider failure reach the caller", async () => {
    sendEmail.mockRejectedValue(new Error("Resend is down"));

    await expect(
      sendInviteEmail({ to: "new@example.com", acceptUrl, expiresInDays: 7 }),
    ).rejects.toThrow("Resend is down");
  });
});
