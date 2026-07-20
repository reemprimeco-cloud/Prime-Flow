import { describe, expect, it } from "vitest";

import { getTodayBoundsInKuwait } from "@/lib/utils/date";

describe("getTodayBoundsInKuwait", () => {
  it("returns a 24-hour window", () => {
    const { start, end } = getTodayBoundsInKuwait(new Date("2026-07-20T10:00:00Z"));
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("keeps a UTC evening within the same Kuwait day (no rollover past midnight Kuwait time)", () => {
    // 21:30 UTC = 00:30 next day in Kuwait (UTC+3) — this should already be "tomorrow" in Kuwait.
    const { start } = getTodayBoundsInKuwait(new Date("2026-07-20T21:30:00Z"));
    expect(start.toISOString()).toBe("2026-07-20T21:00:00.000Z"); // 2026-07-21T00:00 Kuwait time
  });

  it("keeps an early UTC morning within the previous Kuwait day", () => {
    // 01:00 UTC = 04:00 Kuwait time on the same date — still that Kuwait day.
    const { start } = getTodayBoundsInKuwait(new Date("2026-07-20T01:00:00Z"));
    expect(start.toISOString()).toBe("2026-07-19T21:00:00.000Z"); // 2026-07-20T00:00 Kuwait time
  });

  it("correctly classifies a timestamp just before and after the Kuwait midnight boundary", () => {
    const { start, end } = getTodayBoundsInKuwait(new Date("2026-07-20T10:00:00Z"));
    const justBefore = new Date(start.getTime() - 1);
    const justAfter = new Date(start.getTime() + 1);
    expect(justBefore.getTime() < start.getTime()).toBe(true);
    expect(justAfter.getTime() >= start.getTime() && justAfter.getTime() < end.getTime()).toBe(true);
  });
});
