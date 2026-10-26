import { describe, expect, it } from "vitest";
import {
  cardEvidence,
  describePaymentSourceEvidence,
  detectStatedPaymentSource,
  ownEmailText,
  parseCardLast4,
  parseCardLast4sInput,
  parsePaymentQuestionRef,
  paymentQuestionRef,
  paymentSourceListLabel,
  paymentSourceSummary,
  resolvePaymentSource,
} from "@/lib/expenses/payment-source";
import { parseEmailBodyText, mergeReceiptExtractions } from "@/lib/expenses/inbound-merge";
import { normalizeAiExtraction, parseReceiptText } from "@/lib/expenses/receipt-parse";

describe("detectStatedPaymentSource", () => {
  it.each([
    ["Train ticket #personal", ""],
    ["Train ticket", "I paid personally, please reimburse me."],
    ["Lunch", "Paid with my own card"],
    ["Lunch", "Put it on my credit card"],
    ["Taxi", "Out of pocket, sorry for the delay"],
    ["Hotel", "Didn't have the company card with me so used my debit card"],
  ])("reads %s / %s as personal", (subject, body) => {
    expect(detectStatedPaymentSource(subject, body)).toBe("personal");
  });

  it.each([
    ["Adobe #company", ""],
    ["Adobe renewal", "Paid on the company card"],
    ["Courier", "This came out of the business account"],
    ["Software", "Paid by the company, receipt attached"],
    ["Lunch", "I didn't pay for this personally"],
  ])("reads %s / %s as company", (subject, body) => {
    expect(detectStatedPaymentSource(subject, body)).toBe("company");
  });

  it("returns undefined when nothing is said", () => {
    expect(detectStatedPaymentSource("Receipt", "Total £24.00")).toBeUndefined();
  });

  it("returns undefined when the text points both ways", () => {
    expect(
      detectStatedPaymentSource("Receipts", "One on my card and one on the company card"),
    ).toBeUndefined();
    expect(detectStatedPaymentSource("#personal #company", "")).toBeUndefined();
  });

  it("lets a tag beat a phrase", () => {
    expect(detectStatedPaymentSource("#company", "Paid out of pocket")).toBe("company");
  });

  it("ignores quoted and forwarded text", () => {
    const reply = [
      "#company",
      "",
      "On Sat, 25 Oct 2026 at 20:00, Alfa <noreply@example.com>",
      "wrote:",
      "> Reply with #personal if you paid and need paying back, or #company if the company paid.",
    ].join("\n");
    expect(detectStatedPaymentSource("Re: How did you pay? [Claim ABCD1234]", reply)).toBe(
      "company",
    );

    const forward = [
      "See below",
      "",
      "---------- Forwarded message ---------",
      "From: Shop <orders@shop.example>",
      "Thanks for paying with your company card",
    ].join("\n");
    expect(detectStatedPaymentSource("Fwd: Your order", forward)).toBeUndefined();
  });
});

describe("ownEmailText", () => {
  it("keeps the sender's own lines only", () => {
    expect(ownEmailText("Hi\n> quoted\nThanks\nOn Mon, Bob wrote:\nold")).toBe("Hi\nThanks");
  });

  it("stops at an Outlook style header block after the reply", () => {
    expect(ownEmailText("#personal\n\nFrom: Alfa <a@b.c>\nSent: today\n#company")).toBe(
      "#personal",
    );
  });
});

describe("parseCardLast4", () => {
  it.each([
    ["Card: ************1234", "1234"],
    ["VISA DEBIT XXXX XXXX XXXX 4321", "4321"],
    ["Mastercard ending in 9876", "9876"],
    ["Paid with Visa ending 5555", "5555"],
    ["AMEX ...1002", "1002"],
    ["Visa: 2468", "2468"],
  ])("finds the card in %s", (text, expected) => {
    expect(parseCardLast4(text)).toBe(expected);
  });

  it("ignores dates and words that look like masks", () => {
    expect(parseCardLast4("Visa Debit 2024-10-01")).toBeUndefined();
    expect(parseCardLast4("MAXX 2024 summer sale")).toBeUndefined();
    expect(parseCardLast4("Total £12.00")).toBeUndefined();
  });

  it("gives up when two different cards are shown", () => {
    expect(parseCardLast4("**** 1111 and **** 2222")).toBeUndefined();
  });

  it("is read by local OCR, AI extraction, the email body and merging", () => {
    expect(parseReceiptText("Coffee Shop\nTotal £3.50\nCard **** 4242").cardLast4).toBe("4242");
    expect(normalizeAiExtraction({ cardLast4: "**** 4242" }).cardLast4).toBe("4242");
    expect(normalizeAiExtraction({ cardLast4: "42" }).cardLast4).toBeUndefined();
    expect(parseEmailBodyText("Fwd: receipt", "Paid with Visa ending 1234").cardLast4).toBe(
      "1234",
    );
    expect(
      mergeReceiptExtractions({ confidence: "none" }, { confidence: "partial", cardLast4: "7777" })
        .cardLast4,
    ).toBe("7777");
  });
});

describe("parseCardLast4sInput", () => {
  it("accepts a list and drops duplicates", () => {
    expect(parseCardLast4sInput("1234, 5678 1234")).toEqual({
      ok: true,
      value: ["1234", "5678"],
    });
    expect(parseCardLast4sInput("  ")).toEqual({ ok: true, value: [] });
  });

  it("rejects anything that isn't four digits", () => {
    expect(parseCardLast4sInput("1234, 12345").ok).toBe(false);
  });
});

describe("resolvePaymentSource", () => {
  const statedPersonal = { kind: "stated", source: "personal", via: "email" } as const;
  const bank = {
    kind: "bank_match",
    source: "company",
    bookedAt: "2026-10-01",
    confirmed: false,
  } as const;

  it("suggests nothing without evidence", () => {
    expect(resolvePaymentSource([null, undefined])).toEqual({
      suggestion: null,
      evidence: [],
      conflict: false,
    });
  });

  it("uses agreeing evidence", () => {
    const companyCard = cardEvidence("1234", ["1234"]);
    expect(resolvePaymentSource([bank, companyCard]).suggestion).toBe("company");
  });

  it("flags disagreement instead of picking a side", () => {
    const result = resolvePaymentSource([bank, statedPersonal]);
    expect(result.suggestion).toBeNull();
    expect(result.conflict).toBe(true);
    // What the sender said is listed first.
    expect(result.evidence[0]).toEqual(statedPersonal);
  });

  it("only counts an unknown card as personal once company cards are listed", () => {
    expect(cardEvidence("9999", [])).toBeNull();
    expect(cardEvidence("9999", ["1234"])).toEqual({
      kind: "card",
      source: "personal",
      last4: "9999",
    });
  });

  it("summarises for the review screens", () => {
    const summary = paymentSourceSummary(resolvePaymentSource([statedPersonal]));
    expect(summary).toEqual({
      suggestion: "personal",
      suggestedStatus: "reimbursable",
      conflict: false,
      notes: ["The sender says they paid personally"],
    });
    expect(paymentSourceListLabel(resolvePaymentSource([statedPersonal]))).toBe(
      "Paid personally?",
    );
    expect(paymentSourceListLabel(resolvePaymentSource([bank, statedPersonal]))).toBe(
      "Unclear how paid",
    );
    expect(paymentSourceListLabel(resolvePaymentSource([]))).toBeNull();
    expect(describePaymentSourceEvidence(bank)).toBe(
      "Matches a company bank payment on 2026-10-01 (suggested match)",
    );
  });
});

describe("payment question reference", () => {
  it("round-trips through a reply subject", () => {
    const jobId = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
    const ref = paymentQuestionRef(jobId);
    expect(ref).toBe("0A1B2C3D");
    expect(parsePaymentQuestionRef(`RE: How did you pay? [Claim ${ref}]: Lunch`)).toBe(ref);
    expect(parsePaymentQuestionRef("Lunch receipt")).toBeUndefined();
  });
});
