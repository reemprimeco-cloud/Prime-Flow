"use client";

import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/lib/hooks/use-online-status";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground">
      <WifiOff className="size-3.5" />
      You&apos;re offline — changes won&apos;t save until your connection comes back.
    </div>
  );
}
