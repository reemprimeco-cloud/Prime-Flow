import { requireEmployee } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/demo/mode";
import { LogoutButton } from "@/components/shared/logout-button";
import { DemoModeBanner } from "@/components/shared/demo-mode-banner";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireEmployee();

  return (
    <div className="flex min-h-screen flex-col">
      {isDemoMode() && <DemoModeBanner />}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-primary font-mono text-xs font-bold text-primary-foreground">
            PP
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">My Jobs</div>
            <div className="text-xs text-muted-foreground leading-tight">{session.fullName}</div>
          </div>
        </div>
        <LogoutButton />
      </header>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
