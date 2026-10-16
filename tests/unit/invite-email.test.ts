import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inviteAcceptUrl } from "@/lib/clerk-invite";
import { buildInviteEmail } from "@/lib/invite-email";

describe("inviteAcceptUrl", () => {
  it("moves the Clerk ticket onto the app sign-up URL", () => {
    const url = inviteAcceptUrl(
      "https://clerk.example.com/v1/tickets/accept?ticket=abc.def-ghi&redirect_url=x",
    );
    expect(url).toMatch(/\/sign-up\?__clerk_ticket=abc\.def-ghi$/);
    expect(url).not.toContain("clerk.example.com");
  });

  it("returns null when Clerk gives no ticket", () => {
    expect(inviteAcceptUrl(undefined)).toBeNull();
    expect(inviteAcceptUrl("https://clerk.example.com/v1/tickets/accept")).toBeNull();
  });
});

describe("buildInviteEmail", () => {
  const acceptUrl = "https://alfa.example.com/sign-up?__clerk_ticket=t";

  it("names the inviter and company", () => {
    const email = buildInviteEmail({
      acceptUrl,
      expiresInDays: 7,
      companyName: "Acme Ltd",
      inviterName: "Sam",
    });
    expect(email.subject).toBe("Sam invited you to Acme Ltd on Alfa");
    expect(email.html).toContain("Sam has invited you to join Acme Ltd on Alfa");
    expect(email.text).toContain(acceptUrl);
    expect(email.text).toContain("expires in 7 days");
  });

  it("falls back to a generic invite and uses singular days", () => {
    const email = buildInviteEmail({
      acceptUrl,
      expiresInDays: 1,
      companyName: null,
      inviterName: null,
    });
    expect(email.subject).toBe("You're invited to Alfa");
    expect(email.text).toContain("expires in 1 day.");
  });

  it("escapes names in the HTML body", () => {
    const email = buildInviteEmail({
      acceptUrl,
      expiresInDays: 7,
      companyName: "<script>",
      inviterName: null,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
