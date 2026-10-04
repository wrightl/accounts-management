"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  saveCompanyNotificationPrefsAction,
  saveUserNotificationPrefsAction,
  subscribeWebPushAction,
  unsubscribeWebPushAction,
} from "@/actions/notifications";
import {
  NOTIFICATION_CATALOG,
  type NotificationChannels,
} from "@/lib/notifications/types";
import type { EventChannelMatrix } from "@/lib/notifications/prefs-merge";
import { clientEnv } from "@/env";

type Mode = "company" | "user";

const CHANNELS: { key: keyof NotificationChannels; label: string }[] = [
  { key: "inApp", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
];

export function NotificationPrefsForm({
  mode,
  initial,
  showPushEnable = false,
}: {
  mode: Mode;
  initial: EventChannelMatrix;
  showPushEnable?: boolean;
}) {
  const [matrix, setMatrix] = useState<EventChannelMatrix>(() => {
    const next: EventChannelMatrix = {};
    for (const event of NOTIFICATION_CATALOG) {
      next[event.type] = {
        ...event.defaultChannels,
        ...(initial[event.type] ?? {}),
      };
    }
    return next;
  });
  const [pending, startTransition] = useTransition();
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const vapidPublic = clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const title = useMemo(
    () =>
      mode === "company"
        ? "Company notification defaults"
        : "Your notification preferences",
    [mode],
  );

  function toggle(
    type: string,
    channel: keyof NotificationChannels,
    value: boolean,
  ) {
    setMatrix((prev) => ({
      ...prev,
      [type]: {
        ...(prev[type] ?? { inApp: true, email: false, push: false }),
        [channel]: value,
      },
    }));
  }

  function onSave() {
    startTransition(async () => {
      const result =
        mode === "company"
          ? await saveCompanyNotificationPrefsAction(matrix)
          : await saveUserNotificationPrefsAction(matrix);
      if (!result.ok) {
        toast(result.error ?? "Could not save preferences");
        return;
      }
      toast("Notification preferences saved");
    });
  }

  async function enablePush() {
    if (!vapidPublic) {
      setPushStatus("Push is not configured on this environment.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("This browser does not support push notifications.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("Permission denied.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic),
        }));
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setPushStatus("Could not read subscription keys.");
        return;
      }
      const result = await subscribeWebPushAction({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (!result.ok) {
        setPushStatus(result.error ?? "Subscribe failed");
        return;
      }
      setPushStatus("Browser push enabled.");
      toast("Browser push enabled");
    } catch (error) {
      setPushStatus(
        error instanceof Error ? error.message : "Could not enable push",
      );
    }
  }

  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribeWebPushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setPushStatus("Browser push disabled.");
      toast("Browser push disabled");
    } catch (error) {
      setPushStatus(
        error instanceof Error ? error.message : "Could not disable push",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted">
          Choose how you want to hear about each event. In-app is the web and
          mobile inbox; push covers browser and mobile device alerts.
        </p>
      </div>

      {showPushEnable ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-medium">Browser push</p>
          <p className="mt-1 text-xs text-muted">
            Allow this browser to show alerts when you are away from the app.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={enablePush}>
              Enable
            </Button>
            <Button type="button" variant="ghost" onClick={disablePush}>
              Disable
            </Button>
          </div>
          {pushStatus ? (
            <p className="mt-2 text-xs text-muted">{pushStatus}</p>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-border bg-wash text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Event</th>
              {CHANNELS.map((c) => (
                <th key={c.key} className="px-3 py-3 text-center font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_CATALOG.map((event) => {
              const channels = matrix[event.type] ?? event.defaultChannels;
              return (
                <tr
                  key={event.type}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{event.label}</p>
                    <p className="text-xs text-muted">{event.description}</p>
                  </td>
                  {CHANNELS.map((c) => (
                    <td key={c.key} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={channels[c.key]}
                        onChange={(e) =>
                          toggle(event.type, c.key, e.target.checked)
                        }
                        aria-label={`${event.label} ${c.label}`}
                        className="h-4 w-4 accent-navy"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button type="button" onClick={onSave} disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
