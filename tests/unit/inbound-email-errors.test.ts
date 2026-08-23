import { describe, expect, it } from "vitest";
import {
  describeFetchError,
  inboundJobNeedsAttention,
  parseInboundErrorMessage,
} from "@/lib/expenses/inbound-errors";

describe("describeFetchError", () => {
  it("extracts nested cause and code from fetch failures", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const err = new Error("fetch failed", { cause });

    expect(describeFetchError(err)).toEqual({
      message: "fetch failed",
      cause: "connect ECONNREFUSED",
      code: "ECONNREFUSED",
    });
  });

  it("handles non-Error values", () => {
    expect(describeFetchError("network down")).toEqual({ message: "network down" });
  });
});

describe("parseInboundErrorMessage", () => {
  it("parses structured inbound processing errors", () => {
    const raw =
      '[attachment.download] · fetch failed · cause: Connect Timeout Error · code: UND_ERR_CONNECT_TIMEOUT · {"attachment":"receipt.pdf","url":"https://cdn.resend.app/receiving/x/attachments/y"}';

    expect(parseInboundErrorMessage(raw)).toEqual({
      step: "attachment.download",
      summary: "fetch failed",
      cause: "Connect Timeout Error",
      code: "UND_ERR_CONNECT_TIMEOUT",
      attachment: "receipt.pdf",
      url: "https://cdn.resend.app/receiving/x/attachments/y",
    });
  });

  it("parses rejected sender messages", () => {
    expect(parseInboundErrorMessage("REJECTED: Sender is not an authorised founder")).toEqual({
      summary: "Sender is not an authorised founder",
    });
  });
});

describe("inboundJobNeedsAttention", () => {
  it("flags failed jobs and pending jobs with errors", () => {
    expect(inboundJobNeedsAttention("failed", "network error")).toBe(true);
    expect(inboundJobNeedsAttention("pending", "network error")).toBe(true);
    expect(inboundJobNeedsAttention("pending", null)).toBe(false);
    expect(inboundJobNeedsAttention("processed", null)).toBe(false);
  });
});
