"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function EmployeeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[employee-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="flex max-w-md flex-col items-center gap-5 px-8 py-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-8" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
          <p className="mt-1 text-base text-muted-foreground">Tap the button below to try again.</p>
        </div>
        <Button onClick={reset} size="xl" className="w-full">
          <RotateCw className="size-5" />
          Try again
        </Button>
      </Card>
    </div>
  );
}
