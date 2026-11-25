"use client";

import { useEffect } from "react";
import {
  CLIENT_DETAILS_COOKIE,
  DEVICE_ID_COOKIE,
  DEVICE_ID_MAX_AGE_SECONDS,
} from "@/lib/hmrc/device-cookies";
import type { WebClientDetails } from "@/lib/hmrc/fraud-headers";

function readCookie(name: string): string | null {
  const row = document.cookie.split("; ").find((r) => r.startsWith(`${name}=`));
  return row ? row.slice(name.length + 1) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds?: number) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = maxAgeSeconds ? `; Max-Age=${maxAgeSeconds}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${maxAge}${secure}`;
}

function currentDetails(): WebClientDetails {
  return {
    screens: [
      {
        width: window.screen.width,
        height: window.screen.height,
        scalingFactor: window.devicePixelRatio || 1,
        colourDepth: window.screen.colorDepth,
      },
    ],
    window: { width: window.innerWidth, height: window.innerHeight },
    // getTimezoneOffset is minutes west of UTC; HMRC wants east.
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
    userAgent: navigator.userAgent,
  };
}

/**
 * Keeps the device details HMRC's fraud prevention headers need in cookies,
 * so any server action that calls HMRC can send them: a device ID kept for
 * two years, and the screen, window, timezone and browser, refreshed on load
 * and when the window is resized.
 */
export function HmrcClientDetailsCookie() {
  useEffect(() => {
    // Refresh the device ID's expiry each visit so it stays the same.
    const existing = readCookie(DEVICE_ID_COOKIE);
    const deviceId = existing ? decodeURIComponent(existing) : crypto.randomUUID();
    writeCookie(DEVICE_ID_COOKIE, deviceId, DEVICE_ID_MAX_AGE_SECONDS);

    let timer: number | undefined;
    const save = () => writeCookie(CLIENT_DETAILS_COOKIE, JSON.stringify(currentDetails()));
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 300);
    };
    save();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return null;
}
