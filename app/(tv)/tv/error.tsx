"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

const RETRY_SECONDS = 10;

/** Unattended kiosk display — nobody is there to click "try again", so this retries itself. */
export default function TvError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(RETRY_SECONDS);

  useEffect(() => {
    console.error("[tv-error-boundary]", error);
  }, [error]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      reset();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, reset]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-3xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-10" />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-foreground">Production Board is reconnecting</h1>
        <p className="mt-2 text-xl text-muted-foreground">Retrying in {secondsLeft}s…</p>
      </div>
    </div>
  );
}
