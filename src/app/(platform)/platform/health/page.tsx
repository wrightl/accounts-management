import { requirePlatformAdmin } from "@/lib/platform";
import { serverEnv } from "@/env";
import { hasDatabaseClient } from "@/db";
import { getPlatformSettings } from "@/lib/platform-settings";
import { RunDailyCronButton } from "@/components/platform/run-cron-button";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-sm">
      <span>{label}</span>
      <span
        className={
          ok
            ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"
            : "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
        }
      >
        {ok ? "Configured" : "Missing"}
      </span>
    </li>
  );
}

export default async function PlatformHealthPage() {
  await requirePlatformAdmin();

  const env = serverEnv();
  const checks = [
    { label: "Database", ok: hasDatabaseClient() },
    { label: "Vercel Blob", ok: Boolean(env.BLOB_READ_WRITE_TOKEN) },
    {
      label: "Resend email",
      ok: env.EMAIL_PROVIDER === "console" || Boolean(env.RESEND_API_KEY),
    },
    { label: "Resend webhook secret", ok: Boolean(env.RESEND_WEBHOOK_SECRET) },
    { label: "AI Gateway", ok: Boolean(env.AI_GATEWAY_API_KEY) },
    { label: "Cron secret", ok: Boolean(env.CRON_SECRET) },
  ];

  const settings =
    hasDatabaseClient()
      ? await getPlatformSettings()
      : null;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Health</h1>
      <p className="mt-1 text-muted">
        Integration configuration and last cron runs.
      </p>

      <ul className="mt-6 max-w-lg space-y-2">
        {checks.map((c) => (
          <StatusPill key={c.label} ok={c.ok} label={c.label} />
        ))}
      </ul>

      <section className="mt-8 max-w-lg rounded-2xl border border-border bg-white p-5">
        <h2 className="font-display text-lg font-semibold">Cron</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Last daily</dt>
            <dd>
              {settings?.lastCronDailyAt
                ? settings.lastCronDailyAt.toLocaleString("en-GB")
                : "never"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Last inbound drain</dt>
            <dd>
              {settings?.lastCronInboundAt
                ? settings.lastCronInboundAt.toLocaleString("en-GB")
                : "never"}
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <RunDailyCronButton />
        </div>
      </section>
    </div>
  );
}
