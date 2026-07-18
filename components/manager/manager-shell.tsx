"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";

import { SidebarNav } from "@/components/manager/sidebar-nav";
import { GlobalSearch } from "@/components/manager/global-search";
import { LogoutButton } from "@/components/shared/logout-button";
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
 * completely unchanged. Below lg, that sidebar is replaced by a sticky
 * mobile top bar + a slide-in drawer (the same Sheet primitive used
 * elsewhere) holding identical content — an app-style nav pattern rather
 * than the sidebar just squeezing itself into a phone-width viewport.
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
      <LogoutButton className="w-full justify-center" />
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {showDemoBanner && <DemoModeBanner />}

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-border">
            <Image src="/logo.jpg" alt="Prime Printing Co." width={32} height={32} className="size-full object-cover" priority />
          </div>
          <span className="text-sm font-bold">Prime Printing</span>
        </div>
        <div className="size-9" aria-hidden />
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col gap-8 border-r border-border bg-card/60 p-5 lg:flex">
          {sidebarContent}
        </aside>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="flex w-[280px] flex-col gap-8 p-5 sm:max-w-[280px]">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {sidebarContent}
          </SheetContent>
        </Sheet>

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
