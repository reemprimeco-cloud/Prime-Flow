"use server";

import { requireEmployee } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";

/**
 * Device registration for Web Push. Called by components/shared/push-toggle
 * right after the browser hands back a PushSubscription — the browser owns
 * the permission prompt and the keys; all this does is remember which
 * employee the device belongs to so notifications can be addressed.
 */

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export async function savePushSubscription(input: PushSubscriptionInput): Promise<void> {
  const session = await requireEmployee();
  if (isDemoMode()) return;

  const supabase = createServiceClient();
  // Upsert on endpoint: browsers silently re-issue a subscription when it
  // expires or is refreshed, and the same device shouldn't accumulate rows.
  // Re-registering also re-points the device at whoever is logged in now,
  // which is the correct behaviour on a shared shop tablet.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      employee_id: session.employeeId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await requireEmployee();
  if (isDemoMode()) return;

  const supabase = createServiceClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

/** Lets the client confirm this device is still registered before showing itself as "on". */
export async function isPushSubscribed(endpoint: string): Promise<boolean> {
  await requireEmployee();
  if (isDemoMode()) return false;

  const supabase = createServiceClient();
  const { data } = await supabase.from("push_subscriptions").select("id").eq("endpoint", endpoint).maybeSingle();
  return Boolean(data);
}
