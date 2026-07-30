/**
 * Notification preference shape + defaults — shared between the server
 * (lib/notifications/service.ts, decides whether to send) and the client
 * (components/orders/order-form.tsx, renders the toggles). Deliberately
 * has no "server-only" import so both can import it directly, same
 * pattern as lib/realtime/constants.ts.
 */

export interface NotificationPreferences {
  order_received: boolean;
  order_in_production: boolean;
  ready_for_pickup: boolean;
  out_for_delivery: boolean;
  delivered: boolean;
}

/**
 * Every order sends the customer exactly two WhatsApp updates — the order
 * form doesn't expose per-type toggles, so this is applied unconditionally
 * rather than being a user-editable choice. `order_received` and `delivered`
 * stay off deliberately: the customer just placed the order (they don't need
 * a text confirming that), and by `delivered` they already have it in hand.
 * `ready_for_pickup` also gates order_collected_confirmation in
 * lib/notifications/service.ts's STATUS_TEMPLATE — kept off there too, same
 * "already have it" reasoning as `delivered`.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  order_received: false,
  order_in_production: true,
  ready_for_pickup: true,
  out_for_delivery: true,
  delivered: false,
};

export const NOTIFICATION_PREFERENCE_LABELS: Record<keyof NotificationPreferences, string> = {
  order_received: "Order received",
  order_in_production: "Order in production",
  ready_for_pickup: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

/** Fills in any keys missing from a possibly-partial/legacy stored value with defaults. */
export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  if (typeof value !== "object" || value === null) return DEFAULT_NOTIFICATION_PREFERENCES;
  const partial = value as Partial<NotificationPreferences>;
  return {
    order_received: partial.order_received ?? DEFAULT_NOTIFICATION_PREFERENCES.order_received,
    order_in_production: partial.order_in_production ?? DEFAULT_NOTIFICATION_PREFERENCES.order_in_production,
    ready_for_pickup: partial.ready_for_pickup ?? DEFAULT_NOTIFICATION_PREFERENCES.ready_for_pickup,
    out_for_delivery: partial.out_for_delivery ?? DEFAULT_NOTIFICATION_PREFERENCES.out_for_delivery,
    delivered: partial.delivered ?? DEFAULT_NOTIFICATION_PREFERENCES.delivered,
  };
}
