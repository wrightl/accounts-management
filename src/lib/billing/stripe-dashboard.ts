import "server-only";

/** Stripe Dashboard link for a customer or subscription, in the key's mode. */
export function stripeDashboardUrl(
  kind: "customers" | "subscriptions",
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  const testMode = /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "");
  return `https://dashboard.stripe.com/${testMode ? "test/" : ""}${kind}/${encodeURIComponent(id)}`;
}
