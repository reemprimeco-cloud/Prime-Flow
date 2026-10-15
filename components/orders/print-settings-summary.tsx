import { Printer } from "lucide-react";

import { mixedMediaRows, printSettingRows, type PrintSettings } from "@/lib/print-settings";
import { cn } from "@/lib/utils";

/**
 * The Fiery block an operator reads before printing: preset in the header,
 * the rest as a two-column grid, mixed-media ranges underneath. Renders
 * nothing when the order has no print settings, so older orders are
 * unchanged.
 */
export function PrintSettingsCard({ settings, className }: { settings: PrintSettings | null | undefined; className?: string }) {
  const rows = printSettingRows(settings);
  const ranges = mixedMediaRows(settings);
  if (rows.length === 0 && ranges.length === 0) return null;
  const preset = rows.find((r) => r.key === "preset");
  const body = rows.filter((r) => r.key !== "preset");

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border", className)}>
      <div className="flex items-center justify-between gap-2 bg-destructive/10 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-destructive">
        <span className="flex items-center gap-1.5">
          <Printer className="size-3.5" />
          Fiery · Print Settings
        </span>
        {preset && (
          <span className="rounded-md bg-card px-2 py-0.5 font-mono text-xs normal-case tracking-normal text-foreground">
            {preset.value}
          </span>
        )}
      </div>
      {body.length > 0 && (
        <dl className="grid grid-cols-2">
          {body.map((row, index) => {
            const wide = row.key === "mediaType" || row.key === "notes";
            return (
              <div
                key={row.key}
                className={cn(
                  "min-w-0 border-t border-border px-3 py-2",
                  wide ? "col-span-2" : index % 2 === 0 && "border-r"
                )}
              >
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{row.label}</dt>
                <dd className="break-words text-sm font-bold text-foreground">{row.value}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {ranges.length > 0 && (
        <div className="border-t border-border">
          <div className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Mixed media</div>
          {ranges.map((range, index) => (
            <div key={index} className="grid grid-cols-[96px_1fr] items-baseline gap-2 border-t border-dashed border-border px-3 py-1.5 first-of-type:border-t-0">
              <span className="text-xs font-extrabold text-destructive">{range.title}</span>
              <span className="break-words text-xs font-semibold text-foreground">{range.summary || "Same as job"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Label/value rows for the manager's order drawer. */
export function PrintSettingsRows({ settings }: { settings: PrintSettings | null | undefined }) {
  const rows = printSettingRows(settings);
  const ranges = mixedMediaRows(settings);
  if (rows.length === 0 && ranges.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <div key={row.key} className="flex items-start justify-between gap-4 text-sm">
          <span className="shrink-0 text-muted-foreground">{row.label}</span>
          <span className="min-w-0 break-words text-right font-medium text-foreground">{row.value}</span>
        </div>
      ))}
      {ranges.map((range, index) => (
        <div key={`range-${index}`} className="flex items-start justify-between gap-4 text-sm">
          <span className="shrink-0 text-muted-foreground">{range.title}</span>
          <span className="min-w-0 break-words text-right font-medium text-foreground">{range.summary || "Same as job"}</span>
        </div>
      ))}
    </>
  );
}
