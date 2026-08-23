import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/lib/html";
import { todayIsoDate } from "@/lib/dates";
import { safeFilename, contentDispositionAttachment } from "@/lib/files";

describe("escapeHtml", () => {
  it("escapes markup that would otherwise land in HTML email", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
    );
  });
});

describe("todayIsoDate (Europe/London)", () => {
  it("stays on the London calendar date after 23:00 UTC in winter", () => {
    expect(todayIsoDate(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-15");
  });

  it("rolls to the next London day after 23:00 UTC in BST", () => {
    expect(todayIsoDate(new Date("2026-08-21T23:30:00Z"))).toBe("2026-08-22");
  });
});

describe("safeFilename", () => {
  it("strips path segments and unsafe characters", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename('inv"quote.pdf')).toBe("inv_quote.pdf");
  });
});

describe("contentDispositionAttachment", () => {
  it("quotes an ascii-safe filename", () => {
    expect(contentDispositionAttachment("Invoice DD-2026-0001.pdf")).toBe(
      'attachment; filename="Invoice_DD-2026-0001.pdf"',
    );
  });
});
