import { describe, expect, it } from "vitest";
import {
  CLIENT_IMPORT_TEMPLATE_CSV,
  clientImportCommitRows,
  clientImportHasErrors,
  parseClientImportCsv,
} from "@/lib/clients/import-csv";

describe("parseClientImportCsv", () => {
  it("parses the template without errors", () => {
    const rows = parseClientImportCsv(CLIENT_IMPORT_TEMPLATE_CSV);
    expect(rows.length).toBeGreaterThan(0);
    expect(clientImportHasErrors(rows)).toBe(false);
    expect(rows[0].name).toBeTruthy();
  });

  it("dedupes by email within the file", () => {
    const csv = [
      "name,email",
      "Jane,jane@acme.example",
      "Jane Again,jane@acme.example",
    ].join("\n");
    const rows = parseClientImportCsv(csv);
    expect(rows[0].action).toBe("create");
    expect(rows[1].action).toBe("skip_duplicate_in_file");
    expect(clientImportHasErrors(rows)).toBe(false);
    expect(clientImportCommitRows(rows)).toHaveLength(1);
  });

  it("dedupes by company+name when email missing", () => {
    const csv = [
      "name,company_name",
      "Jane,Acme",
      "Jane,Acme",
    ].join("\n");
    const rows = parseClientImportCsv(csv);
    expect(rows[1].action).toBe("skip_duplicate_in_file");
  });

  it("flags invalid email", () => {
    const csv = ["name,email", "Jane,not-an-email"].join("\n");
    const rows = parseClientImportCsv(csv);
    expect(rows[0].errors.some((e) => e.includes("Invalid email"))).toBe(true);
    expect(clientImportHasErrors(rows)).toBe(true);
  });
});
