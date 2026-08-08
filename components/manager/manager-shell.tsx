"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { SidebarNav } from "@/components/manager/sidebar-nav";
import { MobileTabBar } from "@/components/manager/mobile-tab-bar";
import { GlobalSearch } from "@/components/manager/global-search";
import { LogoutButton } from "@/components/shared/logout-button";
import { PushToggle } from "@/components/shared/push-toggle";
import { DemoModeBanner } from "@/components/shared/demo-mode-banner";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EMPLOYEE_ROLE_LABELS } from "@/types/domain";
import type { EmployeeRole } from "@/types/database.types";

interface ManagerShellProps {
  fullName: string;
  role: EmployeeRole;
  showDemoBanner: boolean;
  children: React.ReactNode;
}

/**
 * Desktop (lg and up) keeps the original always-visible 260px sidebar,
 * completely unchanged. Below lg it's an iOS-style shell instead: a
 * compact title bar up top and a fixed bottom tab bar for the four
 * most-used destinations, with the remaining nav behind its "More" tab —
 * which opens the same Sheet drawer holding the full `SidebarNav`, so
 * nothing is unreachable and the nav list stays defined in one place.
 *
 * Both bars sit inside the safe area (`pt-safe`/`pb-safe`) so they clear
 * the Dynamic Island and home indicator once the board is launched from
 * the iOS home screen — see app/layout.tsx and docs/ARCHITECTURE.md.
 */
export function ManagerShell({ fullName, role, showDemoBanner, children }: ManagerShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sidebarContent = (
    <>
      <Link href="/dashboard" className="flex items-center gap-3 px-1" onClick={() => setMobileNavOpen(false)}>
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-border">
          <Image src="/logo.jpg" alt="Prime Printing Co." width={40} height={40} className="size-full object-cover" priority />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">Prime Printing</div>
          <div className="text-xs text-muted-foreground leading-tight">Production Board</div>
        </div>
      </Link>

      <GlobalSearch />

      <SidebarNav onNavigate={() => setMobileNavOpen(false)} />

      <div className="mt-auto flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
          {fullName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{fullName}</div>
          <Badge variant="default" className="mt-0.5">
            {EMPLOYEE_ROLE_LABELS[role]}
          </Badge>
        </div>
      </div>
      <PushToggle className="w-full justify-center" />
      <LogoutButton className="w-full justify-center" />
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {showDemoBanner && <DemoModeBanner />}

      <header className="sticky top-0 z-30 flex items-center justify-center border-b border-border bg-card/95 px-4 pt-safe backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2 py-3">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg border border-border">
            <Image src="/logo.jpg" alt="Prime Printing Co." width={28} height={28} className="size-full object-cover" priority />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">Prime Printing</span>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col gap-8 border-r border-border bg-card/60 p-5 lg:flex">
          {sidebarContent}
        </aside>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          {/* Bottom sheet rather than the old left drawer — matches how iOS
              surfaces a "More" list, and lands under the thumb. */}
          <SheetContent side="bottom" className="flex max-h-[85vh] flex-col gap-6 overflow-y-auto rounded-t-2xl p-5 pb-safe">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {sidebarContent}
          </SheetContent>
        </Sheet>

        {/* pb-24 keeps the last card clear of the fixed tab bar; it's only
            needed below lg, where that bar exists. */}
        <main className="min-w-0 flex-1 p-4 pb-24 lg:p-8 lg:pb-8">{children}</main>
      </div>

      <MobileTabBar onMore={() => setMobileNavOpen(true)} moreOpen={mobileNavOpen} />
    </div>
  );
}
