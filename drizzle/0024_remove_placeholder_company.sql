-- Remove migration placeholder company if it was auto-inserted and never used.
-- Safe no-op when the company has members or business data, or does not exist.
DELETE FROM "companies" c
WHERE c."name" = 'Dot + Dash Consulting'
  AND c."legal_name" = 'Dot and Dash Consulting Ltd'
  AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "company_memberships" m WHERE m."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "clients" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "invoices" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "expenses" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "reimbursements" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "bank_accounts" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "bank_spending_categories" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "shareholders" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "dividend_declarations" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "quote_decline_reason_categories" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "orders" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "quotes" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "send_jobs" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "inbound_email_jobs" x WHERE x."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "recurring_invoices" x WHERE x."company_id" = c."id");
