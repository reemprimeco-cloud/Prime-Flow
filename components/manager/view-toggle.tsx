"use client";

import { Columns3, LayoutGrid, List } from "lucide-react";

import { cn } from "@/lib/utils";

export type OrderView = "board" | "card" | "list";

interface ViewToggleProps {
  view: OrderView;
  onChange: (view: OrderView) => void;
}

const OPTIONS: { view: OrderView; icon: typeof Columns3; label: string }[] = [
  { view: "board", icon: Columns3, label: "Board view" },
  { view: "card", icon: LayoutGrid, label: "Card view" },
  { view: "list", icon: List, label: "Compact list view" },
];

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted/30 p-1">
      {OPTIONS.map(({ view: optionView, icon: Icon, label }) => (
        <button
          key={optionView}
          type="button"
          onClick={() => onChange(optionView)}
          aria-pressed={view === optionView}
          aria-label={label}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            view === optionView ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
