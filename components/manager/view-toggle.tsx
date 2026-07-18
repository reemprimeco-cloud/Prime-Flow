"use client";

import { LayoutGrid, List } from "lucide-react";

import { cn } from "@/lib/utils";

export type OrderView = "card" | "list";

interface ViewToggleProps {
  view: OrderView;
  onChange: (view: OrderView) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted/30 p-1">
      <button
        type="button"
        onClick={() => onChange("card")}
        aria-pressed={view === "card"}
        aria-label="Card view"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          view === "card" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutGrid className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-pressed={view === "list"}
        aria-label="Compact list view"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <List className="size-4" />
      </button>
    </div>
  );
}
