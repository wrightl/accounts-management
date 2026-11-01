"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createPdfImportBatch,
  uploadInvoicePdf,
} from "@/actions/invoice-import-pdf";
import { FieldError, Label } from "@/components/ui/form";
import { MAX_RECEIPT_BYTES } from "@/lib/expenses/receipt-file";

const CONCURRENCY = 2;

/** Upload invoice PDFs, one request per file because of the 4.5 MB body limit. */
export function InvoicePdfImport() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  function upload(files: File[]) {
    if (files.length === 0) return;
    setProblems([]);
    startTransition(async () => {
      const batch = await createPdfImportBatch();
      if (!batch.ok) {
        setProblems([batch.error]);
        return;
      }
      const found: string[] = [];
      let done = 0;
      let saved = 0;
      const queue = [...files];
      setProgress(`Reading 0 of ${files.length}…`);
      const worker = async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          if (file.size > MAX_RECEIPT_BYTES) {
            found.push(`${file.name} is over 4.5 MB`);
          } else {
            const formData = new FormData();
            formData.set("document", file);
            try {
              const result = await uploadInvoicePdf(batch.id, formData);
              if (result.ok) saved += 1;
              else found.push(result.error);
            } catch {
              found.push(`${file.name} couldn't be uploaded. Try it again.`);
            }
          }
          done += 1;
          setProgress(`Reading ${done} of ${files.length}…`);
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      setProgress(null);
      setProblems(found);
      if (saved > 0 && found.length === 0) router.push(`/invoices/import/${batch.id}`);
      else if (saved > 0) {
        setProblems([...found, "The other files are ready to review."]);
        router.push(`/invoices/import/${batch.id}`);
      }
    });
  }

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="font-display text-lg font-semibold">Or upload invoice PDFs</h2>
      <p className="mt-1 text-sm text-muted">
        Good for a smaller number of invoices. AI reads each one, and you check it against the PDF
        before anything is saved. Each file can be up to 4.5 MB and hold one invoice.
      </p>
      <div className="mt-3">
        <Label htmlFor="invoice-pdfs">PDF files</Label>
        <input
          id="invoice-pdfs"
          type="file"
          accept="application/pdf"
          multiple
          disabled={pending}
          aria-describedby={problems.length ? "invoice-pdfs-error" : undefined}
          onChange={(e) => upload([...(e.target.files ?? [])])}
        />
      </div>
      {progress ? <p className="mt-2 text-sm">{progress}</p> : null}
      <FieldError id="invoice-pdfs-error">
        {problems.length ? problems.join(" ") : null}
      </FieldError>
    </section>
  );
}
