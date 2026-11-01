// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReceiptPanel } from "@/components/expenses/receipt-panel";
import { ReceiptUploadField } from "@/components/expenses/receipt-upload-field";
import { extractReceiptFields, uploadReceipt } from "@/actions/expenses";
import {
  MAX_RECEIPT_BYTES,
  RECEIPT_UPLOAD_FAILED_MESSAGE,
} from "@/lib/expenses/receipt-file";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/actions/expenses", () => ({
  deleteReceipt: vi.fn(),
  uploadReceipt: vi.fn(),
  extractReceiptFields: vi.fn(),
}));

// jsdom's FormData can't see files assigned to an input in a test.
vi.mock("@/components/ui/prevent-reset-submit", () => ({
  preventResetSubmit:
    (onSubmit: (formData: FormData) => void) => (event: Event) => {
      event.preventDefault();
      const formData = new FormData();
      formData.set("receipt", new File(["x"], "receipt.pdf"));
      onSubmit(formData);
    },
}));

const uploadMock = vi.mocked(uploadReceipt);
const extractMock = vi.mocked(extractReceiptFields);

afterEach(() => {
  cleanup();
  uploadMock.mockReset();
  extractMock.mockReset();
});

function fileOfSize(size: number) {
  const file = new File(["x"], "receipt.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const oversized = fileOfSize(MAX_RECEIPT_BYTES + 1);
const sizeMessage = /Receipts can be up to 20 MB/;

function renderPanel() {
  render(<ReceiptPanel expenseId="expense-1" receipts={[]} canWrite />);
  return screen.getByLabelText(/Upload receipt/) as HTMLInputElement;
}

function renderField() {
  const onFileChange = vi.fn();
  render(
    <ReceiptUploadField
      receiptOcrProvider="local"
      onFileChange={onFileChange}
      onExtraction={vi.fn()}
    />,
  );
  return { input: screen.getByLabelText("Receipt file"), onFileChange };
}

describe("ReceiptPanel size handling", () => {
  it("refuses an oversized file without sending it", () => {
    const input = renderPanel();
    fireEvent.change(input, { target: { files: [oversized] } });

    expect(screen.getAllByText(sizeMessage)).toHaveLength(1);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("shows a message when the request is refused", async () => {
    uploadMock.mockRejectedValue(new Error("unexpected response"));
    const input = renderPanel();
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByText(RECEIPT_UPLOAD_FAILED_MESSAGE)).toBeTruthy();
  });
});

describe("ReceiptUploadField size handling", () => {
  it("refuses an oversized file without reading or keeping it", () => {
    const { input, onFileChange } = renderField();
    fireEvent.change(input, { target: { files: [oversized] } });

    expect(screen.getByText(sizeMessage)).toBeTruthy();
    expect(extractMock).not.toHaveBeenCalled();
    expect(onFileChange).toHaveBeenLastCalledWith(null);
  });

  it("shows a message when reading the receipt is refused", async () => {
    extractMock.mockRejectedValue(new Error("unexpected response"));
    const { input } = renderField();
    fireEvent.change(input, { target: { files: [fileOfSize(1024)] } });

    await waitFor(() =>
      expect(screen.getByText(/Could not read this receipt/)).toBeTruthy(),
    );
  });
});
