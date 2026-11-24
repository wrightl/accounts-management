"use client";

import { Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { connectHmrc, disconnectHmrcAction } from "@/actions/hmrc";
import { DisplayDate } from "@/components/date-format-provider";
import { useAlert } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Callout, type CalloutTone } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/form";

/** What happened on the way back from HMRC, as /api/hmrc/callback reports it. */
export type HmrcOutcome = "connected" | "denied" | "expired" | "failed" | "forbidden" | "unavailable";

const OUTCOME_COPY: Record<HmrcOutcome, { tone: CalloutTone; text: string }> = {
  connected: { tone: "success", text: "Connected to HMRC." },
  denied: { tone: "warning", text: "You chose not to give Alfa access on HMRC's site, so nothing changed." },
  expired: { tone: "warning", text: "That HMRC sign-in expired or was started elsewhere. Try connecting again." },
  failed: { tone: "danger", text: "HMRC didn't complete the connection. Try again in a few minutes." },
  forbidden: { tone: "danger", text: "Only an admin of this company can connect it to HMRC." },
  unavailable: { tone: "warning", text: "The HMRC connection isn't available on this server yet." },
};

export function HmrcConnectionPanel({
  environment,
  connected,
  connectedAt,
  grantExpiresAt,
  lastUsedAt,
  daysLeft,
  outcome,
}: {
  environment: "sandbox" | "production";
  connected: boolean;
  connectedAt: string | null;
  grantExpiresAt: string | null;
  lastUsedAt: string | null;
  /** Whole days until access runs out, worked out on the server. */
  daysLeft: number | null;
  outcome: HmrcOutcome | null;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function connect() {
    setError(null);
    startTransition(async () => {
      const result = await connectHmrc();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.assign(result.url);
    });
  }

  async function disconnect() {
    const ok = await confirm({
      title: "Disconnect from HMRC",
      message:
        "Alfa forgets its access and can't file for this company until an admin connects again. You can also remove Alfa from your HMRC online account.",
      confirmLabel: "Disconnect",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await disconnectHmrcAction();
      if (!result.ok) setError(result.error);
      else router.replace("/settings/hmrc");
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      {outcome ? <Callout tone={OUTCOME_COPY[outcome].tone}>{OUTCOME_COPY[outcome].text}</Callout> : null}
      {environment === "sandbox" ? (
        <Callout tone="info">
          This server uses HMRC&apos;s sandbox. Sign in on HMRC&apos;s site with a sandbox test user, not a real
          Government Gateway account.
        </Callout>
      ) : null}
      <Card className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">{connected ? "Connected" : "Not connected"}</h2>
          {connected ? (
            <div className="mt-1 space-y-1 text-sm text-muted">
              <p>
                Connected on <DisplayDate value={connectedAt ? new Date(connectedAt) : null} />.
                {lastUsedAt ? (
                  <>
                    {" "}
                    Last used <DisplayDate value={new Date(lastUsedAt)} withTime />.
                  </>
                ) : null}
              </p>
              <p>
                HMRC gives access for 18 months. It runs out on{" "}
                <DisplayDate value={grantExpiresAt ? new Date(grantExpiresAt) : null} />
                {daysLeft !== null && daysLeft <= 30 ? <strong> ({daysLeft} days left): connect again before then.</strong> : "."}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">
              You&apos;ll sign in on HMRC&apos;s site with your Government Gateway account and agree to let Alfa see and
              file your VAT returns. Alfa never sees your HMRC password, and nothing is sent to HMRC until you choose
              to submit a return.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={connect}>
            <Landmark className="h-4 w-4" />
            {pending ? "Opening HMRC…" : connected ? "Connect again" : "Connect to HMRC"}
          </Button>
          {connected ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={disconnect}>
              Disconnect
            </Button>
          ) : null}
        </div>
        <FieldError>{error}</FieldError>
      </Card>
    </div>
  );
}
