import Link from "next/link";

import { requireAdmin } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/demo/mode";
import { SidebarNav } from "@/components/manager/sidebar-nav";
import { LogoutButton } from "@/components/shared/logout-button";
import { DemoModeBanner } from "@/components/shared/demo-mode-banner";
import { Badge } from "@/components/ui/badge";
import { EMPLOYEE_ROLE_LABELS } from "@/types/domain";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      {isDemoMode() && <DemoModeBanner />}
      <div className="flex flex-1">
        <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col gap-8 border-r border-border bg-card/60 p-5">
          <Link href="/dashboard" className="flex items-center gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-primary font-mono text-xs font-bold text-primary-foreground">
              PP
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">Prime Printing</div>
              <div className="text-xs text-muted-foreground leading-tight">Production Board</div>
            </div>
          </Link>

          <SidebarNav />

          <div className="mt-auto flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
              {session.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{session.fullName}</div>
              <Badge variant="default" className="mt-0.5">
                {EMPLOYEE_ROLE_LABELS[session.role]}
              </Badge>
            </div>
          </div>
          <LogoutButton className="w-full justify-center" />
        </aside>

        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
