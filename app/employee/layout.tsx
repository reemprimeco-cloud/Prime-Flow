import Image from "next/image";

import { requireEmployee } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/demo/mode";
import { LogoutButton } from "@/components/shared/logout-button";
import { DemoModeBanner } from "@/components/shared/demo-mode-banner";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireEmployee();

  return (
    <div className="flex min-h-screen flex-col">
      {isDemoMode() && <DemoModeBanner />}
      {/* pt-safe/pb-safe clear the Dynamic Island and home indicator when
          launched from the iOS home screen — see docs/ARCHITECTURE.md. */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/80 px-4 pt-safe backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3 py-3 sm:py-4">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-border">
            <Image src="/logo.jpg" alt="Prime Printing Co." width={36} height={36} className="size-full object-cover" priority />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">My Jobs</div>
            <div className="text-xs text-muted-foreground leading-tight">{session.fullName}</div>
          </div>
        </div>
        <LogoutButton />
      </header>

      <main className="flex-1 p-4 pb-safe sm:p-6">{children}</main>
    </div>
  );
}
