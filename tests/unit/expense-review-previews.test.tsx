// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReceiptPanel } from "@/components/expenses/receipt-panel";
import { EmailBodyPanel } from "@/components/expenses/email-body-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/actions/expenses", () => ({
  deleteReceipt: vi.fn(),
  uploadReceipt: vi.fn(),
}));

afterEach(cleanup);

describe("receipt previews", () => {
  it("shows images and PDFs in the page, and nothing for other files", () => {
    render(
      <ReceiptPanel
        expenseId="e1"
        canWrite={false}
        receipts={[
          { id: "r1", filename: "photo.jpg", contentType: "image/jpeg", sizeBytes: 10 },
          { id: "r2", filename: "bill.pdf", contentType: "application/pdf", sizeBytes: 10 },
          { id: "r3", filename: "notes.svg", contentType: "image/svg+xml", sizeBytes: 10 },
        ]}
      />,
    );
    expect(screen.getByAltText("Preview of photo.jpg").getAttribute("src")).toBe(
      "/api/receipts/r1?inline=1",
    );
    expect(screen.getByTitle("Preview of bill.pdf").getAttribute("src")).toBe(
      "/api/receipts/r2?inline=1",
    );
    expect(screen.queryByAltText("Preview of notes.svg")).toBeNull();
    expect(screen.queryByTitle("Preview of notes.svg")).toBeNull();
    expect(screen.getByRole("link", { name: "photo.jpg" }).getAttribute("href")).toBe(
      "/api/receipts/r1",
    );
  });
});

describe("email body panel", () => {
  const email = {
    fromEmail: "founder@example.com",
    subject: "Lunch",
    receivedAt: "26/10/2026, 09:00:00",
  };

  it("frames the HTML in a sandbox and switches to the plain text", () => {
    render(<EmailBodyPanel expenseId="e1" email={{ ...email, hasHtml: true, hasText: true }} />);
    expect(screen.getByText(/Sent as HTML/)).toBeTruthy();
    const frame = screen.getByTitle("Original email");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("src")).toBe("/api/expenses/e1/email-body?format=html");

    fireEvent.click(screen.getByRole("button", { name: "View plain text" }));
    expect(screen.getByTitle("Original email").getAttribute("src")).toBe(
      "/api/expenses/e1/email-body?format=text",
    );
  });

  it("shows a plain-text email without a switch", () => {
    render(<EmailBodyPanel expenseId="e1" email={{ ...email, hasHtml: false, hasText: true }} />);
    expect(screen.getByText(/Sent as plain text/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when no body was kept", () => {
    render(<EmailBodyPanel expenseId="e1" email={{ ...email, hasHtml: false, hasText: false }} />);
    expect(screen.queryByTitle("Original email")).toBeNull();
    expect(screen.getByText(/wasn’t kept/)).toBeTruthy();
  });
});
