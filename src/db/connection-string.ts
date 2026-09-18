const ALIASED_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

/**
 * Neon (and most hosted Postgres) URLs ship `sslmode=require`. In pg v8 that
 * mode is an alias for `verify-full`, and pg-connection-string emits a Node
 * warning that Next.js surfaces as a console error. Rewrite the aliased modes
 * to `verify-full` so current (strict) TLS behaviour is explicit.
 *
 * Leaves `uselibpqcompat=true` URLs alone — those opted into libpq semantics.
 */
export function postgresConnectionString(connectionString: string): string {
  const qIndex = connectionString.indexOf("?");
  if (qIndex === -1) return connectionString;

  const base = connectionString.slice(0, qIndex);
  const params = new URLSearchParams(connectionString.slice(qIndex + 1));
  if (params.get("uselibpqcompat") === "true") return connectionString;

  const mode = params.get("sslmode")?.toLowerCase();
  if (!mode || !ALIASED_SSL_MODES.has(mode)) return connectionString;

  params.set("sslmode", "verify-full");
  return `${base}?${params.toString()}`;
}
