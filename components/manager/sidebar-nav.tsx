"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  Gauge,
  HeartPulse,
  LayoutGrid,
  PackageCheck,
  PackageSearch,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/operations", label: "Operations", icon: Activity },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/workload", label: "Workload", icon: Gauge },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/material-requests", label: "Material Requests", icon: PackageSearch },
  { href: "/notifications", label: "Notification Center", icon: Bell },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/completed-orders", label: "Completed Orders", icon: PackageCheck },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/diagnostics", label: "Diagnostics", icon: HeartPulse },
] as const;

interface SidebarNavProps {
  /** Fires after a real navigation link is clicked — lets the mobile drawer close itself. */
  onNavigate?: () => void;
}

export function SidebarNav({ onNavigate }: SidebarNavProps = {}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon, ...rest }) => {
        const comingSoon = "comingSoon" in rest && rest.comingSoon;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        if (comingSoon) {
          return (
            <span
              key={href}
              title="Coming in a later phase"
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground/50"
            >
              <Icon className="size-[18px] shrink-0" />
              {label}
              <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            </span>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-[18px] shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
