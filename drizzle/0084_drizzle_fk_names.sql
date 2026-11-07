-- Foreign keys from hand-written migrations kept Postgres's default names ("*_fkey").
-- Rename them to the names drizzle-kit uses, so generated migrations can find them.
-- Renaming a constraint only changes the catalogue: no data is rewritten.
-- Postgres truncates names over 63 characters, the same way drizzle's DROP statements will.
ALTER TABLE "accountant_queries" RENAME CONSTRAINT "accountant_queries_company_id_fkey" TO "accountant_queries_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "accountant_queries" RENAME CONSTRAINT "accountant_queries_raised_by_user_id_fkey" TO "accountant_queries_raised_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "accountant_query_messages" RENAME CONSTRAINT "accountant_query_messages_author_user_id_fkey" TO "accountant_query_messages_author_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "accountant_query_messages" RENAME CONSTRAINT "accountant_query_messages_company_id_fkey" TO "accountant_query_messages_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "accountant_query_messages" RENAME CONSTRAINT "accountant_query_messages_query_id_fkey" TO "accountant_query_messages_query_id_accountant_queries_id_fk";
--> statement-breakpoint
ALTER TABLE "assistant_connections" RENAME CONSTRAINT "assistant_connections_user_id_fkey" TO "assistant_connections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "assistant_draft_requests" RENAME CONSTRAINT "assistant_draft_requests_company_id_fkey" TO "assistant_draft_requests_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "assistant_draft_requests" RENAME CONSTRAINT "assistant_draft_requests_user_id_fkey" TO "assistant_draft_requests_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "bank_transaction_labels" RENAME CONSTRAINT "bank_transaction_labels_bank_transaction_id_fkey" TO "bank_transaction_labels_bank_transaction_id_bank_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "bank_transaction_labels" RENAME CONSTRAINT "bank_transaction_labels_label_id_fkey" TO "bank_transaction_labels_label_id_labels_id_fk";
--> statement-breakpoint
ALTER TABLE "data_onboarding" RENAME CONSTRAINT "data_onboarding_company_id_fkey" TO "data_onboarding_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "deadline_filings" RENAME CONSTRAINT "deadline_filings_company_id_fkey" TO "deadline_filings_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "deadline_filings" RENAME CONSTRAINT "deadline_filings_filed_by_user_id_fkey" TO "deadline_filings_filed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "document_sequences" RENAME CONSTRAINT "document_sequences_company_id_fkey" TO "document_sequences_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "expense_labels" RENAME CONSTRAINT "expense_labels_expense_id_fkey" TO "expense_labels_expense_id_expenses_id_fk";
--> statement-breakpoint
ALTER TABLE "expense_labels" RENAME CONSTRAINT "expense_labels_label_id_fkey" TO "expense_labels_label_id_labels_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" RENAME CONSTRAINT "expenses_billable_client_id_clients_id_fk" TO "expenses_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" RENAME CONSTRAINT "expenses_inbound_email_job_id_fkey" TO "expenses_inbound_email_job_id_inbound_email_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" RENAME CONSTRAINT "expenses_order_id_fkey" TO "expenses_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" RENAME CONSTRAINT "inbound_email_jobs_answers_job_id_fkey" TO "inbound_email_jobs_answers_job_id_inbound_email_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_import_batches" RENAME CONSTRAINT "invoice_import_batches_company_id_fkey" TO "invoice_import_batches_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_import_batches" RENAME CONSTRAINT "invoice_import_batches_created_by_user_id_fkey" TO "invoice_import_batches_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_import_drafts" RENAME CONSTRAINT "invoice_import_drafts_batch_id_fkey" TO "invoice_import_drafts_batch_id_invoice_import_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_import_drafts" RENAME CONSTRAINT "invoice_import_drafts_company_id_fkey" TO "invoice_import_drafts_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_import_drafts" RENAME CONSTRAINT "invoice_import_drafts_invoice_id_fkey" TO "invoice_import_drafts_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_line_items" RENAME CONSTRAINT "invoice_line_items_expense_id_fkey" TO "invoice_line_items_expense_id_expenses_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_pdf_reads" RENAME CONSTRAINT "invoice_pdf_reads_company_id_fkey" TO "invoice_pdf_reads_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" RENAME CONSTRAINT "invoices_import_batch_id_fkey" TO "invoices_import_batch_id_invoice_import_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "labels" RENAME CONSTRAINT "labels_company_id_fkey" TO "labels_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "released_inbound_aliases" RENAME CONSTRAINT "released_inbound_aliases_membership_id_fkey" TO "released_inbound_aliases_membership_id_company_memberships_id_fk";
