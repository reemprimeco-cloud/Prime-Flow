import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Log in — Prime Production Board",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-primary font-mono text-lg font-bold text-primary-foreground shadow-[0_8px_24px_-8px_rgba(30,64,175,0.6)]">
            PP
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Prime Printing Co.</h1>
            <p className="text-sm text-muted-foreground">Production Board</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7 shadow-xl">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Ask your manager if you don&apos;t have login credentials.
        </p>
      </div>
    </div>
  );
}
