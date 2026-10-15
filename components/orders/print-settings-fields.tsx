"use client";

import { useState } from "react";
import { Controller, useFieldArray, useWatch, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { ChevronDown, ChevronUp, Plus, Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BOOKLET_BINDINGS,
  COLOR_MODES,
  CUSTOM_PAPER_SIZES,
  EMPTY_MIXED_MEDIA_RANGE,
  FIERY_PRESETS,
  FOLDS,
  LAYOUTS,
  MEDIA_TYPE_GROUPS,
  MIXED_MEDIA_KINDS,
  PAPER_SOURCES,
  SIDES,
  STANDARD_PAPER_SIZES,
  STAPLES,
  normalizePrintSettings,
  printSettingRows,
  type PrintSettingsInput,
} from "@/lib/print-settings";
import { cn } from "@/lib/utils";

/**
 * The "Fiery Print Settings" block on the order form — one per item.
 *
 * Generic over the form shape so the same component serves item 1
 * (`prefix="printSettings"`) and items 2+ (`prefix="items.3.printSettings"`).
 * Every field is optional; the block collapses to a one-line summary so a
 * quick order with no Fiery detail stays as short as before.
 */
interface PrintSettingsFieldsProps<TForm extends FieldValues> {
  control: Control<TForm>;
  prefix: string;
  /** Paper sizes typed on earlier orders — offered under "Custom sheets" alongside the built-in ones. */
  paperSizeSuggestions: string[];
  /** Small, for items 2+ nested inside their own card. */
  compact?: boolean;
}

const OTHER = "__other__";
const INHERIT = "__inherit__";

export function PrintSettingsFields<TForm extends FieldValues>({
  control,
  prefix,
  paperSizeSuggestions,
  compact = false,
}: PrintSettingsFieldsProps<TForm>) {
  const path = (field: string) => `${prefix}.${field}` as FieldPath<TForm>;
  const value = useWatch({ control, name: prefix as FieldPath<TForm> }) as PrintSettingsInput | undefined;
  const setCount = printSettingRows(normalizePrintSettings(value)).length + (value?.mixedMedia?.length ?? 0);
  // Open by default when editing an order that already has settings; a brand
  // new order starts collapsed so the manager opts in to the extra fields.
  const [open, setOpen] = useState(setCount > 0);
  const layout = value?.layout;

  const { fields: ranges, append, remove } = useFieldArray({
    control,
    name: path("mixedMedia") as never,
  });

  return (
    <div className="flex flex-col rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-left hover:bg-muted/60"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-destructive">
            <Printer className="mr-1 inline size-3 align-[-2px]" />
            Fiery
          </span>
          Print Settings
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {setCount > 0 ? `${setCount} set` : "Optional"}
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>

      {open && (
        <div className={cn("grid grid-cols-1 gap-3 p-3 sm:grid-cols-2", compact && "gap-2.5")}>
          <Field label="Preset">
            <ComboSelect
              control={control}
              name={path("preset")}
              options={[{ label: "Fiery presets", options: [...FIERY_PRESETS] }]}
              otherLabel="Other preset…"
              placeholder="None"
            />
          </Field>
          <Field label="Media type">
            <ComboSelect
              control={control}
              name={path("mediaType")}
              options={MEDIA_TYPE_GROUPS}
              otherLabel="Other media type…"
              placeholder="None"
            />
          </Field>
          <Field label="Paper source">
            <EnumSelect control={control} name={path("paperSource")} map={PAPER_SOURCES} placeholder="None" />
          </Field>
          <Field label="Paper size">
            <PaperSizeSelect control={control} name={path("paperSize")} suggestions={paperSizeSuggestions} placeholder="None" />
          </Field>
          <Field label="Sides">
            <EnumSelect control={control} name={path("sides")} map={SIDES} placeholder="None" />
          </Field>
          <Field label="Color mode">
            <EnumSelect control={control} name={path("colorMode")} map={COLOR_MODES} placeholder="None" />
          </Field>
          <Field label="Layout">
            <EnumSelect control={control} name={path("layout")} map={LAYOUTS} placeholder="None" />
          </Field>
          {layout === "booklet" ? (
            <Field label="Binding">
              <EnumSelect control={control} name={path("bookletBinding")} map={BOOKLET_BINDINGS} placeholder="None" />
            </Field>
          ) : (
            <div className="hidden sm:block" aria-hidden />
          )}
          <Field label="Fold">
            <EnumSelect control={control} name={path("fold")} map={FOLDS} placeholder="None" />
          </Field>
          <Field label="Staple">
            <EnumSelect control={control} name={path("staple")} map={STAPLES} placeholder="None" />
          </Field>
          <Field label="Other Fiery settings (optional)" className="sm:col-span-2">
            <Controller
              control={control}
              name={path("notes")}
              render={({ field }) => (
                <Input
                  {...field}
                  value={(field.value as string) ?? ""}
                  placeholder="e.g. 600dpi, Image quality: Best, Toner saving off"
                />
              )}
            />
          </Field>

          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <div>
              <div className="text-sm font-bold text-foreground">Mixed media</div>
              <div className="text-xs text-muted-foreground">Cover, page ranges or inserts on different media. Empty fields inherit the job settings above.</div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => append(EMPTY_MIXED_MEDIA_RANGE as never)}>
              <Plus className="size-3.5" /> Add page range
            </Button>
          </div>

          {ranges.map((range, index) => (
            <div key={range.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/30 p-2.5 sm:col-span-2">
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <EnumSelect
                  control={control}
                  name={path(`mixedMedia.${index}.kind`)}
                  map={MIXED_MEDIA_KINDS}
                  placeholder="Kind"
                  allowEmpty={false}
                />
                <Controller
                  control={control}
                  name={path(`mixedMedia.${index}.pages`)}
                  render={({ field }) => <PagesInput field={field} kind={value?.mixedMedia?.[index]?.kind} />}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(index)}
                  aria-label={`Remove mixed media range ${index + 1}`}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Media type" small>
                  <ComboSelect
                    control={control}
                    name={path(`mixedMedia.${index}.mediaType`)}
                    options={MEDIA_TYPE_GROUPS}
                    otherLabel="Other media type…"
                    placeholder="Same as job"
                  />
                </Field>
                <Field label="Paper size" small>
                  <PaperSizeSelect
                    control={control}
                    name={path(`mixedMedia.${index}.paperSize`)}
                    suggestions={paperSizeSuggestions}
                    placeholder="Same as job"
                  />
                </Field>
                <Field label="Paper source" small>
                  <EnumSelect control={control} name={path(`mixedMedia.${index}.paperSource`)} map={PAPER_SOURCES} placeholder="Same as job" />
                </Field>
                <Field label="Sides" small>
                  <EnumSelect control={control} name={path(`mixedMedia.${index}.sides`)} map={SIDES} placeholder="Same as job" />
                </Field>
                <Field label="Color mode" small>
                  <EnumSelect control={control} name={path(`mixedMedia.${index}.colorMode`)} map={COLOR_MODES} placeholder="Same as job" />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

function Field({ label, className, small, children }: { label: string; className?: string; small?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label className={cn("mb-1.5", small && "text-xs")}>{label}</Label>
      {children}
    </div>
  );
}

interface ControlledProps<TForm extends FieldValues> {
  control: Control<TForm>;
  name: FieldPath<TForm>;
  placeholder: string;
}

/** A select over a label map; "" (the empty choice) means "not set" / "same as job". */
function EnumSelect<TForm extends FieldValues>({
  control,
  name,
  map,
  placeholder,
  allowEmpty = true,
}: ControlledProps<TForm> & { map: Record<string, string>; allowEmpty?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          value={(field.value as string) || INHERIT}
          onValueChange={(next) => field.onChange(next === INHERIT ? "" : next)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {allowEmpty && <SelectItem value={INHERIT}>{placeholder}</SelectItem>}
            {Object.entries(map).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

/**
 * A grouped select with an "Other…" escape hatch that swaps in a free-text
 * input. A stored value that isn't in the list (typed earlier, or a preset
 * added on the Fiery since) shows in the input rather than vanishing.
 */
function ComboSelect<TForm extends FieldValues>({
  control,
  name,
  options,
  otherLabel,
  placeholder,
}: ControlledProps<TForm> & { options: { label: string; options: string[] }[]; otherLabel: string }) {
  const known = new Set(options.flatMap((g) => g.options));
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <ComboSelectInner field={field} known={known} options={options} otherLabel={otherLabel} placeholder={placeholder} />}
    />
  );
}

function ComboSelectInner({
  field,
  known,
  options,
  otherLabel,
  placeholder,
}: {
  field: { value: unknown; onChange: (v: string) => void };
  known: Set<string>;
  options: { label: string; options: string[] }[];
  otherLabel: string;
  placeholder: string;
}) {
  const current = (field.value as string) ?? "";
  const [typing, setTyping] = useState(current !== "" && !known.has(current));
  if (typing) {
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={current}
          onChange={(e) => field.onChange(e.target.value)}
          placeholder="Type it as the Fiery shows it"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground"
          aria-label="Back to list"
          onClick={() => {
            field.onChange("");
            setTyping(false);
          }}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }
  return (
    <Select
      value={current || INHERIT}
      onValueChange={(next) => {
        if (next === OTHER) {
          field.onChange("");
          setTyping(true);
          return;
        }
        field.onChange(next === INHERIT ? "" : next);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={INHERIT}>{placeholder}</SelectItem>
        {options.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        <SelectSeparator />
        <SelectItem value={OTHER} className="font-semibold text-secondary">
          {otherLabel}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Standard sheets, the shop's custom sheets, sizes used on earlier orders, and "Add custom size…". */
function PaperSizeSelect<TForm extends FieldValues>({
  control,
  name,
  suggestions,
  placeholder,
}: ControlledProps<TForm> & { suggestions: string[] }) {
  const builtIn = new Set<string>([...STANDARD_PAPER_SIZES, ...CUSTOM_PAPER_SIZES]);
  const remembered = suggestions.filter((s) => !builtIn.has(s));
  const groups = [
    { label: "Standard sheets", options: [...STANDARD_PAPER_SIZES] },
    { label: "Custom sheets", options: [...CUSTOM_PAPER_SIZES, ...remembered] },
  ];
  return <ComboSelect control={control} name={name} options={groups} otherLabel="Add custom size…" placeholder={placeholder} />;
}

function PagesInput({ field, kind }: { field: { value: unknown; onChange: (v: string) => void }; kind: string | undefined }) {
  const placeholder =
    kind === "front_cover" ? "Page 1" : kind === "back_cover" ? "Last page" : kind === "insert" ? "e.g. after page 4" : "e.g. 2-20";
  return <Input value={(field.value as string) ?? ""} onChange={(e) => field.onChange(e.target.value)} placeholder={placeholder} />;
}

