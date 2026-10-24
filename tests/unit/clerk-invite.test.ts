import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createInvitation, revokeInvitation, sendInviteEmail } = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  sendInviteEmail: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    invitations: { createInvitation, revokeInvitation },
  })),
}));

const inviteEmailModule = () => ({ sendInviteEmail });

const CLERK_URL = "https://clerk.example.com/v1/tickets/accept?ticket=tkt_1";

async function loadClerkInvite(inviteEmail: () => object = inviteEmailModule) {
  vi.resetModules();
  vi.doMock("@/lib/invite-email", inviteEmail);
  return import("@/lib/clerk-invite");
}

beforeEach(() => {
  process.env.CLERK_SECRET_KEY = "sk_test_mock";
  createInvitation.mockReset().mockResolvedValue({ id: "inv_1", url: CLERK_URL });
  revokeInvitation.mockReset().mockResolvedValue({});
  sendInviteEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.CLERK_SECRET_KEY;
  vi.doUnmock("@/lib/invite-email");
});

describe("sendClerkInvitation", () => {
  it("sends our own email with the app accept link and suppresses Clerk's", async () => {
    const { sendClerkInvitation } = await loadClerkInvite();

    const result = await sendClerkInvitation(" New@Example.com ", { companyId: "co_1" });

    expect(result).toEqual({ ok: true });
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ emailAddress: "new@example.com", notify: false }),
    );
    expect(sendInviteEmail).toHaveBeenCalledWith({
      to: "new@example.com",
      acceptUrl: expect.stringMatching(/\/sign-up\?__clerk_ticket=tkt_1$/),
      expiresInDays: 7,
      context: { companyId: "co_1" },
    });
    expect(revokeInvitation).not.toHaveBeenCalled();
  });

  it("revokes the invitation when our email fails to send", async () => {
    sendInviteEmail.mockRejectedValue(new Error("Resend is down"));
    const { sendClerkInvitation } = await loadClerkInvite();

    const result = await sendClerkInvitation("new@example.com");

    expect(result).toEqual({
      ok: false,
      error: "Could not send the invitation email: Resend is down",
    });
    expect(revokeInvitation).toHaveBeenCalledWith("inv_1");
  });

  it.each([
    ["no URL", undefined],
    ["a URL without a ticket", "https://clerk.example.com/v1/tickets/accept"],
    ["a malformed URL", "not a url"],
  ])("revokes the invitation when Clerk returns %s", async (_label, url) => {
    createInvitation.mockResolvedValue({ id: "inv_1", url });
    const { sendClerkInvitation } = await loadClerkInvite();

    const result = await sendClerkInvitation("new@example.com");

    expect(result.ok).toBe(false);
    expect(revokeInvitation).toHaveBeenCalledWith("inv_1");
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("falls back to Clerk's email when the invite email module can't load", async () => {
    const { sendClerkInvitation } = await loadClerkInvite(() => {
      throw new Error("This module cannot be imported from a Client Component module.");
    });

    const result = await sendClerkInvitation("new@example.com");

    expect(result).toEqual({ ok: true });
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ notify: true }),
    );
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });
});
