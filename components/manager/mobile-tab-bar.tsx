"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, LayoutGrid, MoreHorizontal, PackageSearch } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * iOS-style bottom tab bar, shown below `lg` in place of the hamburger
 * drawer. Four destinations plus "More" — Apple's own limit is five, and
 * past that the labels stop fitting at phone widths.
 *
 * The remaining eleven nav items live behind "More", which opens the same
 * drawer the hamburger used to; `SidebarNav` is still the single source of
 * truth for the full list, so nothing has to be kept in sync here beyond
 * these four shortcuts.
 */
const TABS = [
  { href: "/dashboard", label: "Board", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/material-requests", label: "Materials", icon: PackageSearch },
  { href: "/notifications", label: "Alerts", icon: Bell },
] as const;

interface MobileTabBarProps {
  onMore: () => void;
  /** True while the More drawer is open, so its tab reads as active. */
  moreOpen: boolean;
}

export function MobileTabBar({ onMore, moreOpen }: MobileTabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-safe backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive = !moreOpen && (pathname === href || pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              // min-h-[50px] keeps every tab at Apple's 44pt minimum touch
              // target even before the safe-area padding below it.
              className={cn(
                "flex min-h-[50px] flex-1 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 transition-colors active:bg-muted/60",
                isActive ? "text-secondary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("size-[22px] shrink-0", isActive && "fill-secondary/10")} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onMore}
          aria-expanded={moreOpen}
          className={cn(
            "flex min-h-[50px] flex-1 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 transition-colors active:bg-muted/60",
            moreOpen ? "text-secondary" : "text-muted-foreground"
          )}
        >
          <MoreHorizontal className="size-[22px] shrink-0" />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}
