/** Postgres unique-constraint violation (23505), however the driver wraps it. */
export function isUniqueViolation(err: unknown): boolean {
  const code =
    typeof err === "object" && err !== null
      ? String(
          (err as { code?: string }).code ??
            (err as { cause?: { code?: string } }).cause?.code ??
            "",
        )
      : "";
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint/i.test(message);
}
