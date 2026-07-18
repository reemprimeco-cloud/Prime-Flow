"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="flex max-w-md flex-col items-center gap-4 px-8 py-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-7" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The page hit an unexpected error. Your data is safe — try again, and if it keeps happening let your
            administrator know.
          </p>
        </div>
        <Button onClick={reset} className="mt-2">
          <RotateCw className="size-4" />
          Try again
        </Button>
      </Card>
    </div>
  );
}
