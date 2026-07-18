import { PackageSearch } from "lucide-react";

import { MATERIAL_TYPE_LABELS } from "@/types/domain";
import type { MaterialType } from "@/types/database.types";
import { cn } from "@/lib/utils";

interface MaterialRequestBadgeProps {
  types: MaterialType[];
  className?: string;
}

/** High-visibility banner for pending material requests — not a small pill. */
export function MaterialRequestBadge({ types, className }: MaterialRequestBadgeProps) {
  if (types.length === 0) return null;

  const label = types.map((t) => MATERIAL_TYPE_LABELS[t]).join(", ");

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-warning/50 bg-warning/15 px-3.5 py-2.5",
        className
      )}
    >
      <PackageSearch className="size-4.5 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-warning">Waiting for {label}</span>
      <span className="shrink-0 rounded-full bg-warning px-2.5 py-1 text-xs font-extrabold text-warning-foreground">
        {types.length} Pending
      </span>
    </div>
  );
}
