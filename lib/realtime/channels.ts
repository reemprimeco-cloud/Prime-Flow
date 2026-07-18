import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { CHANNELS, type ChannelName } from "@/lib/realtime/constants";

export { CHANNELS, type ChannelName };

/**
 * Sends a Realtime Broadcast event over REST — no websocket connection
 * needed, safe to call from a short-lived Server Action. Never throws:
 * a dropped realtime event should not fail the mutation that triggered it.
 */
export async function broadcast(
  channel: ChannelName,
  event: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createServiceClient();
  const realtimeChannel = supabase.channel(channel);
  try {
    await realtimeChannel.httpSend(event, payload);
  } catch (error) {
    console.error(`[realtime] failed to broadcast ${channel}/${event}`, error);
  } finally {
    await supabase.removeChannel(realtimeChannel);
  }
}
