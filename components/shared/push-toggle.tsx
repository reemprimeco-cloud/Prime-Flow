"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deletePushSubscription, isPushSubscribed, savePushSubscription } from "@/lib/actions/push";
import { cn } from "@/lib/utils";

/**
 * Turns lock-screen notifications on for this device.
 *
 * Three things make this fiddlier than a normal toggle, all of them
 * browser rules rather than choices:
 *
 * 1. `Notification.requestPermission()` must be called from a real user
 *    gesture, so this can't self-enable on mount — it has to be a button.
 * 2. On iOS, Web Push only exists once the board has been added to the
 *    home screen (iOS 16.4+). In a plain Safari tab `PushManager` is
 *    undefined, so the button explains that instead of failing silently.
 * 3. Permission is per-device, not per-account — so this reads the live
 *    browser subscription rather than anything server-side to decide what
 *    state to show.
 */

/**
 * The VAPID public key travels as base64url but `subscribe()` wants raw
 * bytes. Backed by an explicit ArrayBuffer so the result is a
 * `Uint8Array<ArrayBuffer>` — `Uint8Array.from` widens to ArrayBufferLike,
 * which no longer satisfies BufferSource under current lib.dom types.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

export function PushToggle({ className }: { className?: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      if (typeof window === "undefined") return;

      if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }

      // iOS exposes PushManager only to home-screen installs. Distinguish
      // that from a browser that genuinely can't do push at all, because
      // the fix is completely different (install it vs. use another phone).
      if (!("PushManager" in window)) {
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (!cancelled) setState(isIos ? "needs-install" : "unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;

        // A subscription can outlive its server row (database restored,
        // employee deleted) — confirm both sides agree before claiming on.
        if (existing && (await isPushSubscribed(existing.endpoint))) {
          setState("on");
        } else {
          setState("off");
        }
      } catch {
        if (!cancelled) setState("unsupported");
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        // Required to be true by every browser — a push must always result
        // in a visible notification.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
      });

      const json = subscription.toJSON();
      await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });

      setState("on");
      toast.success("Notifications on for this device");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't enable notifications");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
      toast.success("Notifications off for this device");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't turn notifications off");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading" || state === "unsupported") return null;

  if (state === "needs-install") {
    return (
      <p className={cn("rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground", className)}>
        To get alerts on your lock screen, tap Share and <strong className="font-semibold">Add to Home Screen</strong>, then
        open the board from that icon.
      </p>
    );
  }

  if (state === "blocked") {
    return (
      <p className={cn("rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground", className)}>
        Notifications are blocked for this site. Turn them back on in your browser or iOS Settings to get alerts.
      </p>
    );
  }

  const on = state === "on";
  return (
    <Button
      type="button"
      variant={on ? "outline" : "primary"}
      size="sm"
      disabled={busy}
      onClick={on ? disable : enable}
      className={cn("gap-2", className)}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : on ? <BellOff className="size-4" /> : <Bell className="size-4" />}
      {on ? "Turn off alerts" : "Turn on alerts"}
    </Button>
  );
}
