/**
 * Shared with lib/demo/data.ts. Lives outside lib/actions/orders.ts (a
 * "use server" file, which may only export async functions) so both the
 * real getOrders() and the demo data generator can import the same value.
 */
export const DEFAULT_ORDERS_PAGE_SIZE = 25;
