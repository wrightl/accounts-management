"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate, mutateWide } from "@/lib/mutate";
import {
  clientImportCommitRows,
  clientImportHasErrors,
  parseClientImportCsv,
  parseClientImportCsvFile,
  type ParsedClientImportRow,
} from "@/lib/clients/import-csv";
import {
  clientRawFromFormData,
  parseClientInput,
} from "@/lib/clients/schema";
import type { ActionResult } from "@/actions/result";

export type ClientImportPreviewResult =
  | { ok: true; rows: ParsedClientImportRow[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createClient(formData: FormData): Promise<ActionResult> {
  const parsed = parseClientInput(clientRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [row] = await db
        .insert(clients)
        .values({
          companyId,
          name: parsed.data.name,
          companyName: parsed.data.companyName,
          email: parsed.data.email,
          addressLines: parsed.data.addressLines,
          notes: parsed.data.notes,
        })
        .returning({ id: clients.id });
      return { ok: true, id: row.id };
    },
    {
      audit: { action: "client.create", entityType: "client" },
      paths: ["/clients", "/dashboard"],
    },
  );
}

export async function updateClient(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseClientInput(clientRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      await db
        .update(clients)
        .set({
          name: parsed.data.name,
          companyName: parsed.data.companyName,
          email: parsed.data.email,
          addressLines: parsed.data.addressLines,
          notes: parsed.data.notes,
        })
        .where(and(eq(clients.id, id), eq(clients.companyId, companyId)));
      return { ok: true, id };
    },
    {
      audit: { action: "client.update", entityType: "client", entityId: id },
      paths: ["/clients", `/clients/${id}`],
    },
  );
}

export async function deleteClient(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const linked = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.clientId, id))
        .limit(1);

      if (linked[0]) {
        return {
          ok: false,
          error: "Cannot delete a client that has invoices. Void or reassign them first.",
        };
      }

      await db.delete(clients).where(and(eq(clients.id, id), eq(clients.companyId, companyId)));
      return { ok: true };
    },
    {
      audit: { action: "client.delete", entityType: "client", entityId: id },
      paths: ["/clients", "/dashboard"],
    },
  );
}

export async function previewClientImport(
  formData: FormData,
): Promise<ClientImportPreviewResult> {
  const fileParsed = parseClientImportCsvFile(formData);
  if (!fileParsed.ok) {
    return {
      ok: false,
      error: fileParsed.error,
      fieldErrors: fileParsed.fieldErrors,
    };
  }

  return mutateWide("accounts:write", async ({ companyId }) => {
    const text = await fileParsed.data.file.text();
    const rows = parseClientImportCsv(text);
    if (rows.length === 0) {
      return {
        ok: false,
        error: "No data rows found in CSV",
        fieldErrors: { csv: "No data rows found in CSV" },
      };
    }

    const db = getDb();
    const existing = await db
      .select({
        id: clients.id,
        email: clients.email,
      })
      .from(clients)
      .where(eq(clients.companyId, companyId));
    const byEmail = new Map(
      existing
        .filter((c) => c.email)
        .map((c) => [c.email!.toLowerCase(), c.id]),
    );

    const annotated = rows.map((row) => {
      if (row.errors.length > 0 || row.action === "skip_duplicate_in_file") {
        return row;
      }
      if (row.email && byEmail.has(row.email)) {
        return {
          ...row,
          action: "update" as const,
          existingClientId: byEmail.get(row.email)!,
        };
      }
      return { ...row, action: "create" as const, existingClientId: null };
    });

    return { ok: true, rows: annotated };
  });
}

export async function commitClientImport(
  rowsJson: string,
): Promise<ActionResult & { count?: number }> {
  let rows: ParsedClientImportRow[];
  try {
    rows = JSON.parse(rowsJson) as ParsedClientImportRow[];
  } catch {
    return {
      ok: false,
      error: "Invalid import payload",
      fieldErrors: { commit: "Invalid import payload" },
    };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      error: "No rows to import",
      fieldErrors: { commit: "No rows to import" },
    };
  }
  if (clientImportHasErrors(rows)) {
    return {
      ok: false,
      error: "Fix validation errors before importing",
      fieldErrors: { commit: "Fix validation errors before importing" },
    };
  }

  const toWrite = clientImportCommitRows(rows);
  if (toWrite.length === 0) {
    return {
      ok: false,
      error: "No new or updated clients to import",
      fieldErrors: { commit: "No new or updated clients to import" },
    };
  }

  return mutateWide(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      await db.transaction(async (tx) => {
        for (const row of toWrite) {
          if (row.action === "update" && row.existingClientId) {
            await tx
              .update(clients)
              .set({
                name: row.name,
                companyName: row.companyName,
                email: row.email,
                addressLines: row.addressLines,
                notes: row.notes,
              })
              .where(
                and(
                  eq(clients.id, row.existingClientId),
                  eq(clients.companyId, companyId),
                ),
              );
          } else {
            await tx.insert(clients).values({
              companyId,
              name: row.name,
              companyName: row.companyName,
              email: row.email,
              addressLines: row.addressLines,
              notes: row.notes,
            });
          }
        }
      });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "client.import",
        entityType: "client",
        meta: { count: toWrite.length },
      });

      return { ok: true, count: toWrite.length };
    },
    { paths: ["/clients", "/dashboard"] },
  );
}
