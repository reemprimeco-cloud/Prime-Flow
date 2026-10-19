import { describe, expect, it } from "vitest";

import {
  EMPTY_PRINT_SETTINGS,
  type PrintSettingsInput,
  MEDIA_TYPES,
  mixedMediaRows,
  normalizePrintSettings,
  parsePrintSettings,
  printSettingRows,
  printSettingsSchema,
  summarizePrintSettings,
  toPrintSettingsForm,
} from "@/lib/print-settings";

const BOOKLET: PrintSettingsInput = {
  preset: "Small_booklet",
  mediaType: "Matte coated 6 (257-300 g/m2)",
  paperSource: "multi_purpose_tray",
  paperSize: "33 x 48 cm",
  sides: "duplex_long",
  colorMode: "cmyk",
  layout: "booklet",
  bookletBinding: "right",
  fold: "saddle",
  staple: "saddle_stitch",
  notes: "",
  mixedMedia: [
    { kind: "front_cover", pages: "", mediaType: "Matte coated 8 (326-350 g/m2)", paperSize: "33 x 23 cm", paperSource: "multi_purpose_tray", sides: "simplex", colorMode: "cmyk" },
    { kind: "page_range", pages: "2-20", mediaType: "Plain 2 (91-105 g/m2)", paperSize: "33 x 23 cm", paperSource: "drawer_2", sides: "duplex_long", colorMode: "" },
  ],
};

describe("printSettingsSchema", () => {
  it("accepts the empty form state", () => {
    expect(printSettingsSchema.safeParse(EMPTY_PRINT_SETTINGS).success).toBe(true);
  });

  it("accepts a full booklet job with mixed media", () => {
    expect(printSettingsSchema.safeParse(BOOKLET).success).toBe(true);
  });

  it("rejects an unknown paper source or sides value", () => {
    expect(printSettingsSchema.safeParse({ ...EMPTY_PRINT_SETTINGS, paperSource: "drawer_9" }).success).toBe(false);
    expect(printSettingsSchema.safeParse({ ...EMPTY_PRINT_SETTINGS, sides: "duplex" }).success).toBe(false);
  });

  it("rejects a mixed media row without a kind", () => {
    const result = printSettingsSchema.safeParse({ ...EMPTY_PRINT_SETTINGS, mixedMedia: [{ pages: "2-20" }] });
    expect(result.success).toBe(false);
  });

  it("allows free-text preset, media type and paper size up to the limit", () => {
    const ok = printSettingsSchema.safeParse({ ...EMPTY_PRINT_SETTINGS, preset: "NewPresetFromFiery", paperSize: "35 x 50 cm" });
    expect(ok.success).toBe(true);
    const tooLong = printSettingsSchema.safeParse({ ...EMPTY_PRINT_SETTINGS, preset: "x".repeat(101) });
    expect(tooLong.success).toBe(false);
  });
});

describe("normalizePrintSettings", () => {
  it("returns null when nothing is set", () => {
    expect(normalizePrintSettings(EMPTY_PRINT_SETTINGS)).toBeNull();
    expect(normalizePrintSettings(undefined)).toBeNull();
    expect(normalizePrintSettings({ ...EMPTY_PRINT_SETTINGS, mixedMedia: [{ kind: "page_range", pages: "" }] })).toBeNull();
  });

  it("drops empty fields and keeps the rest trimmed", () => {
    const out = normalizePrintSettings({ ...EMPTY_PRINT_SETTINGS, preset: "  Long8 ", sides: "simplex" });
    expect(out).toEqual({ preset: "Long8", sides: "simplex" });
  });

  it("keeps only mixed media rows that say something", () => {
    const out = normalizePrintSettings({
      ...EMPTY_PRINT_SETTINGS,
      mixedMedia: [
        { kind: "page_range", pages: "" },
        { kind: "front_cover", pages: "", mediaType: "Labels (151-180 g/m2)" },
      ],
    });
    expect(out?.mixedMedia).toEqual([{ kind: "front_cover", mediaType: "Labels (151-180 g/m2)" }]);
  });
});

describe("parsePrintSettings", () => {
  it("round-trips what normalize stored", () => {
    const stored = normalizePrintSettings(BOOKLET);
    expect(parsePrintSettings(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it("reads malformed or foreign JSON as no settings", () => {
    expect(parsePrintSettings(null)).toBeNull();
    expect(parsePrintSettings("Small_booklet")).toBeNull();
    expect(parsePrintSettings({ sides: "both" })).toBeNull();
    expect(parsePrintSettings([])).toBeNull();
  });
});

describe("toPrintSettingsForm", () => {
  it("fills every field so the form never binds undefined", () => {
    const form = toPrintSettingsForm({ preset: "books", mixedMedia: [{ kind: "insert", pages: "after page 4" }] });
    expect(form.preset).toBe("books");
    expect(form.staple).toBe("");
    expect(form.mixedMedia?.[0]).toEqual({ kind: "insert", pages: "after page 4", mediaType: "", paperSize: "", paperSource: "", sides: "", colorMode: "" });
  });
});

describe("display helpers", () => {
  it("renders rows in Fiery order with human labels", () => {
    const rows = printSettingRows(normalizePrintSettings(BOOKLET));
    expect(rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Preset: Small_booklet",
      "Media type: Matte coated 6 (257-300 g/m2)",
      "Paper source: Multi-purpose tray",
      "Paper size: 33 x 48 cm",
      "Sides: 2-sided (long edge)",
      "Color mode: CMYK",
      "Layout: Booklet · Right binding",
      "Fold: Saddle fold",
      "Staple: Saddle stitch",
    ]);
  });

  it("hides fold 'none' and staple 'off', and binding when layout is not booklet", () => {
    const rows = printSettingRows({ fold: "none", staple: "off", layout: "normal", bookletBinding: "right" });
    expect(rows).toEqual([{ key: "layout", label: "Layout", value: "Normal" }]);
  });

  it("titles mixed media rows the way the operator says them", () => {
    const rows = mixedMediaRows(normalizePrintSettings(BOOKLET));
    expect(rows).toEqual([
      { title: "Front cover", summary: "Matte coated 8 (326-350 g/m2) · 33 x 23 cm · Multi-purpose tray · 1-sided · CMYK" },
      { title: "Pages 2-20", summary: "Plain 2 (91-105 g/m2) · 33 x 23 cm · Drawer 2 · 2-sided (long edge)" },
    ]);
    expect(mixedMediaRows({ mixedMedia: [{ kind: "insert", pages: "after page 4" }] })[0].title).toBe("Insert after page 4");
  });

  it("summarizes to one line and counts mixed media ranges", () => {
    expect(summarizePrintSettings(null)).toBeNull();
    expect(summarizePrintSettings({ preset: "Long8", notes: "600dpi" })).toBe("Long8");
    expect(summarizePrintSettings(normalizePrintSettings(BOOKLET))).toContain("2 mixed-media ranges");
  });

  it("lists the most-used media families first and keeps names unique", () => {
    expect(MEDIA_TYPES[0]).toBe("Matte coated 1 (106-128 g/m2)");
    expect(MEDIA_TYPES).toContain("Texture 8 (326-350 g/m2)");
    expect(new Set(MEDIA_TYPES).size).toBe(MEDIA_TYPES.length);
  });
});
