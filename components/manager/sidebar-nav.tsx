"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ClipboardList,
  Users,
  PackageSearch,
  Bell,
  BarChart3,
  Archive,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/material-requests", label: "Material Requests", icon: PackageSearch },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/archive", label: "Archive", icon: Archive },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
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
