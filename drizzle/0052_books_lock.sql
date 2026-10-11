-- Period lock: books closed up to and including this date.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "books_locked_through" date;
