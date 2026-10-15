import { z } from "zod";

/**
 * Fiery Command WorkStation job properties, as the floor needs them to print
 * a job right the first time. Everything is optional: the manager fills in
 * what matters for this job and leaves the rest. Option lists mirror the
 * Prime-Printing Fiery server (presets, media types, trays) so the employee
 * reads the same words on both screens.
 */

export const PAPER_SOURCES = {
  auto: "Auto tray select",
  multi_purpose_tray: "Multi-purpose tray",
  drawer_1: "Drawer 1",
  drawer_2: "Drawer 2",
  drawer_3: "Drawer 3",
  paper_deck: "Paper deck",
} as const;

export const SIDES = {
  simplex: "1-sided",
  duplex_long: "2-sided (long edge)",
  duplex_short: "2-sided (short edge)",
} as const;

/** What a Mixed-media row covers, as Fiery names them. */
export const MIXED_MEDIA_KINDS = {
  front_cover: "Front cover",
  back_cover: "Back cover",
  page_range: "Page range",
  insert: "Insert (blank sheet)",
} as const;

export const COLOR_MODES = {
  cmyk: "CMYK",
  grayscale: "Grayscale",
} as const;

export const LAYOUTS = {
  normal: "Normal",
  gangup: "Gangup",
  booklet: "Booklet",
} as const;

export const BOOKLET_BINDINGS = {
  left: "Left binding",
  right: "Right binding",
} as const;

export const FOLDS = {
  none: "No fold",
  saddle: "Saddle fold",
  half: "Half fold",
  tri: "Tri-fold (C)",
  z: "Z-fold",
  gate: "Gate fold",
} as const;

export const STAPLES = {
  off: "Off",
  corner_upper_left: "Corner (upper left)",
  corner_upper_right: "Corner (upper right)",
  corner_lower_left: "Corner (lower left)",
  corner_lower_right: "Corner (lower right)",
  double_left: "Double (left)",
  double_right: "Double (right)",
  double_top: "Double (top)",
  double_bottom: "Double (bottom)",
  saddle_stitch: "Saddle stitch",
} as const;

/** Server + local presets on the Prime-Printing Fiery, as of Oct 2026. Free text on the form too — a new preset needs no code change. */
export const FIERY_PRESETS = [
  "NormalPrinting",
  "2up_landscape",
  "Duplex_grayscale",
  "Duplex_staple",
  "Large_booklet",
  "Small_booklet",
  "Pre-booklet",
  "Gradebooklet",
  "GradeCover",
  "gradeinside",
  "books",
  "33x48",
  "A3Matt8",
  "A480gsm",
  "A4Sticker",
  "longsticker",
  "Long8",
  "Texture8",
] as const;

/** Fiery weight bands 1–8 (g/m²), shared by every coated/heavy/texture family. */
const WEIGHT_BANDS = ["106-128", "129-150", "151-180", "181-220", "221-256", "257-300", "301-325", "326-350"] as const;
const banded = (family: string) => WEIGHT_BANDS.map((band, i) => `${family} ${i + 1} (${band} g/m2)`);

export interface MediaTypeGroup {
  label: string;
  options: string[];
}

/**
 * Fiery media types, most-used families first (what Prime Printing runs
 * day to day), then the rest of the Fiery list under "Other". Names match
 * the Fiery dropdown so the operator can find the same entry.
 */
export const MEDIA_TYPE_GROUPS: MediaTypeGroup[] = [
  { label: "Matte coated", options: banded("Matte coated") },
  { label: "Plain", options: ["Plain 1 (80-90 g/m2)", "Plain 2 (91-105 g/m2)"] },
  { label: "Heavy", options: banded("Heavy") },
  { label: "Texture", options: banded("Texture") },
  { label: "1-sided coated (glossy)", options: banded("1-sided coated") },
  { label: "2-sided coated (glossy)", options: banded("2-sided coated") },
  { label: "Labels & film", options: ["Labels (151-180 g/m2)", "Clear film (151-180 g/m2)", "Transparency (151-180 g/m2)"] },
  {
    label: "Other",
    options: [
      "Thin 1 (52-63 g/m2)",
      "Thin 2 (52-63 g/m2)",
      "1-sided coated thin 2 (85-90 g/m2)",
      "1-sided coated thin 1 (91-105 g/m2)",
      "Recycled 1 (64-79 g/m2)",
      "Recycled 2 (80-90 g/m2)",
      "Recycled 3 (91-105 g/m2)",
      "Color 1 (64-79 g/m2)",
      "Color 2 (80-90 g/m2)",
      "Pre-punched 1 (64-79 g/m2)",
      "Pre-punched 2 (80-90 g/m2)",
      "Tab 1 (151-180 g/m2)",
      "Tab 2 (181-220 g/m2)",
      "Bond 1 (64-79 g/m2)",
      "Bond 2 (80-90 g/m2)",
      "Bond 3 (91-105 g/m2)",
      "Letterhead (151-180 g/m2)",
    ],
  },
];

/** Flat list, for datalists and validation hints. */
export const MEDIA_TYPES: string[] = MEDIA_TYPE_GROUPS.flatMap((g) => g.options);

/** Standard sheets the Fiery lists by name. */
export const STANDARD_PAPER_SIZES = ["A3", "A4", "A5", "A6", "SRA3 (320 x 450 mm)", "SRA4 (225 x 320 mm)", "Letter", "Legal"] as const;

/**
 * Shop custom sheets, in centimetres as the floor says them. The form also
 * offers "Add custom size", and any size typed there is suggested again on
 * later orders (see listUsedPaperSizes in lib/actions/orders.ts).
 */
export const CUSTOM_PAPER_SIZES = ["33 x 48 cm", "33 x 70 cm", "33 x 23 cm", "32 x 45 cm"] as const;

const enumKeys = <T extends Record<string, string>>(map: T) => Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];
const optionalEnum = <T extends Record<string, string>>(map: T) => z.enum(enumKeys(map)).optional().or(z.literal(""));
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/**
 * One Fiery Mixed-media row: a cover, page range or insert that prints on
 * different media/settings than the rest of the job. Fields left empty
 * inherit the job's own settings.
 */
export const mixedMediaRangeSchema = z.object({
  kind: z.enum(enumKeys(MIXED_MEDIA_KINDS)),
  /** Page range as typed on the Fiery, e.g. "2-20" or "5, 9-12"; an insert says where it goes, e.g. "after page 4". */
  pages: optionalText(50),
  mediaType: optionalText(100),
  paperSize: optionalText(100),
  paperSource: optionalEnum(PAPER_SOURCES),
  sides: optionalEnum(SIDES),
  colorMode: optionalEnum(COLOR_MODES),
});

export type MixedMediaRange = z.infer<typeof mixedMediaRangeSchema>;
export type MixedMediaRangeInput = z.input<typeof mixedMediaRangeSchema>;

export const EMPTY_MIXED_MEDIA_RANGE: MixedMediaRangeInput = {
  kind: "page_range",
  pages: "",
  mediaType: "",
  paperSize: "",
  paperSource: "",
  sides: "",
  colorMode: "",
};

export const printSettingsSchema = z.object({
  preset: optionalText(100),
  mediaType: optionalText(100),
  paperSource: optionalEnum(PAPER_SOURCES),
  paperSize: optionalText(100),
  sides: optionalEnum(SIDES),
  colorMode: optionalEnum(COLOR_MODES),
  layout: optionalEnum(LAYOUTS),
  bookletBinding: optionalEnum(BOOKLET_BINDINGS),
  fold: optionalEnum(FOLDS),
  staple: optionalEnum(STAPLES),
  notes: optionalText(500),
  mixedMedia: z.array(mixedMediaRangeSchema).max(20).optional(),
});

export type PrintSettingsInput = z.input<typeof printSettingsSchema>;
export type PrintSettings = z.infer<typeof printSettingsSchema>;

export const EMPTY_PRINT_SETTINGS: PrintSettingsInput = {
  preset: "",
  mediaType: "",
  paperSource: "",
  paperSize: "",
  sides: "",
  colorMode: "",
  layout: "",
  bookletBinding: "",
  fold: "",
  staple: "",
  notes: "",
  mixedMedia: [],
};

/** Drops empty fields; returns null when nothing is set, so the DB stores null rather than `{}` or a bag of "". */
export function normalizePrintSettings(input: PrintSettings | PrintSettingsInput | null | undefined): PrintSettings | null {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim();
  }
  const ranges = (input.mixedMedia ?? [])
    .map((range) => {
      const row: Record<string, string> = { kind: range.kind };
      for (const [key, value] of Object.entries(range)) {
        if (key !== "kind" && typeof value === "string" && value.trim() !== "") row[key] = value.trim();
      }
      return row as MixedMediaRange;
    })
    // A row with only a kind and nothing else says nothing the operator can act on.
    .filter((row) => Object.keys(row).length > 1);
  if (ranges.length > 0) out.mixedMedia = ranges;
  return Object.keys(out).length > 0 ? (out as PrintSettings) : null;
}

/** Parses the jsonb column back into a typed object; anything malformed (hand-edited row, old shape) reads as "no settings". */
export function parsePrintSettings(value: unknown): PrintSettings | null {
  if (!value || typeof value !== "object") return null;
  const parsed = printSettingsSchema.safeParse(value);
  return parsed.success ? normalizePrintSettings(parsed.data) : null;
}

/** Fills every field so a form can bind to it without `undefined` checks. */
export function toPrintSettingsForm(value: PrintSettings | null | undefined): PrintSettingsInput {
  return {
    ...EMPTY_PRINT_SETTINGS,
    ...(value ?? {}),
    mixedMedia: (value?.mixedMedia ?? []).map((range) => ({ ...EMPTY_MIXED_MEDIA_RANGE, ...range })),
  };
}

export interface PrintSettingRow {
  key: keyof PrintSettings;
  label: string;
  value: string;
}

/** Human-readable rows in the order an operator sets them on the Fiery. */
export function printSettingRows(settings: PrintSettings | null | undefined): PrintSettingRow[] {
  if (!settings) return [];
  const rows: PrintSettingRow[] = [];
  const push = (key: keyof PrintSettings, label: string, value: string | undefined) => {
    if (value) rows.push({ key, label, value });
  };
  const lookup = <T extends Record<string, string>>(map: T, key: string | undefined) =>
    key ? (map[key as keyof T] ?? key) : undefined;

  push("preset", "Preset", settings.preset);
  push("mediaType", "Media type", settings.mediaType);
  push("paperSource", "Paper source", lookup(PAPER_SOURCES, settings.paperSource));
  push("paperSize", "Paper size", settings.paperSize);
  push("sides", "Sides", lookup(SIDES, settings.sides));
  push("colorMode", "Color mode", lookup(COLOR_MODES, settings.colorMode));
  const layout = lookup(LAYOUTS, settings.layout);
  const binding = settings.layout === "booklet" ? lookup(BOOKLET_BINDINGS, settings.bookletBinding) : undefined;
  push("layout", "Layout", layout && binding ? `${layout} · ${binding}` : layout);
  if (settings.fold && settings.fold !== "none") push("fold", "Fold", lookup(FOLDS, settings.fold));
  if (settings.staple && settings.staple !== "off") push("staple", "Staple", lookup(STAPLES, settings.staple));
  push("notes", "Other", settings.notes);
  return rows;
}

export interface MixedMediaRow {
  /** e.g. "Front cover", "Pages 2-20", "Insert after page 4" */
  title: string;
  /** e.g. "Matte coated 8 (326-350 g/m2) · 33 x 23 cm · Multi-purpose tray · 1-sided · CMYK" */
  summary: string;
}

/** Mixed-media ranges as the operator reads them off the job card. */
export function mixedMediaRows(settings: PrintSettings | null | undefined): MixedMediaRow[] {
  const lookup = <T extends Record<string, string>>(map: T, key: string | undefined) =>
    key ? (map[key as keyof T] ?? key) : undefined;
  return (settings?.mixedMedia ?? []).map((range) => {
    const kind: string = MIXED_MEDIA_KINDS[range.kind];
    const pages = range.pages?.trim();
    let title: string = kind;
    if (range.kind === "page_range") title = pages ? `Pages ${pages}` : "Page range";
    else if (range.kind === "insert") title = pages ? `Insert ${pages}` : "Insert";
    else if (pages) title = `${kind} (${pages})`;
    const summary = [
      range.mediaType,
      range.paperSize,
      lookup(PAPER_SOURCES, range.paperSource),
      lookup(SIDES, range.sides),
      lookup(COLOR_MODES, range.colorMode),
    ]
      .filter(Boolean)
      .join(" · ");
    return { title, summary };
  });
}

/** One-line summary for compact places (dashboard card, item list). */
export function summarizePrintSettings(settings: PrintSettings | null | undefined): string | null {
  const rows = printSettingRows(settings).filter((r) => r.key !== "notes");
  const rangeCount = settings?.mixedMedia?.length ?? 0;
  if (rows.length === 0 && rangeCount === 0) return null;
  const parts = rows.map((r) => r.value);
  if (rangeCount > 0) parts.push(`${rangeCount} mixed-media ${rangeCount === 1 ? "range" : "ranges"}`);
  return parts.join(" · ");
}
