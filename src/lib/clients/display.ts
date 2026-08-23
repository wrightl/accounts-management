export type ClientNameFields = {
  name: string;
  companyName?: string | null;
};

/** Prefer the company when set; otherwise the contact name. */
export function clientDisplayName(client: ClientNameFields): string {
  const company = client.companyName?.trim();
  return company || client.name;
}

/** Company then contact on quotes/invoices, skipping a duplicate line. */
export function clientBillToLines(client: ClientNameFields): string[] {
  const company = client.companyName?.trim() || null;
  if (company && company !== client.name) return [company, client.name];
  return [company || client.name];
}
