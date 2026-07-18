import { describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences } from "@/lib/notifications/constants";

describe("normalizeNotificationPreferences", () => {
  it("returns the defaults when given null/undefined", () => {
    expect(normalizeNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(normalizeNotificationPreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns the defaults when given a non-object value", () => {
    expect(normalizeNotificationPreferences("not an object")).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(normalizeNotificationPreferences(42)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("fills in missing keys from a partial/legacy stored value", () => {
    const result = normalizeNotificationPreferences({ order_received: false });
    expect(result.order_received).toBe(false);
    expect(result.ready_for_pickup).toBe(DEFAULT_NOTIFICATION_PREFERENCES.ready_for_pickup);
    expect(result.out_for_delivery).toBe(DEFAULT_NOTIFICATION_PREFERENCES.out_for_delivery);
    expect(result.delivered).toBe(DEFAULT_NOTIFICATION_PREFERENCES.delivered);
    expect(result.order_in_production).toBe(DEFAULT_NOTIFICATION_PREFERENCES.order_in_production);
  });

  it("preserves every explicitly-set key, including ones that differ from the default", () => {
    const explicit = {
      order_received: false,
      order_in_production: true,
      ready_for_pickup: false,
      out_for_delivery: false,
      delivered: false,
    };
    expect(normalizeNotificationPreferences(explicit)).toEqual(explicit);
  });

  it("defaults order_in_production to false (opt-in) and the rest to true (opt-out)", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.order_in_production).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.order_received).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.ready_for_pickup).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.out_for_delivery).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.delivered).toBe(true);
  });
});
