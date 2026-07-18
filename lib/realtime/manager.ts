"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Multiplexed Realtime Broadcast subscriptions. Every `useRealtimeChannel`
 * call for the same channel name shares one physical RealtimeChannel
 * (ref-counted) instead of opening a new websocket subscription per
 * component — this is what keeps Manager/Employee/TV, and any future
 * consumer that joins the same page, from stacking duplicate subscriptions.
 *
 * Also owns reconnect: if a channel drops to CHANNEL_ERROR/TIMED_OUT while
 * it still has listeners, it re-subscribes with capped exponential backoff.
 * The underlying Supabase socket already reconnects on transport loss; this
 * covers channel-level failures that can happen independently of that.
 */

type Listener = (event: string, payload: unknown) => void;

interface ChannelEntry {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  retryTimeout: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
  status: string;
}

const entries = new Map<string, ChannelEntry>();

const MAX_RETRY_DELAY_MS = 15_000;

function scheduleReconnect(channelName: string) {
  const entry = entries.get(channelName);
  if (!entry || entry.listeners.size === 0 || entry.retryTimeout) return;

  const delay = Math.min(1000 * 2 ** entry.retryAttempt, MAX_RETRY_DELAY_MS);
  entry.retryAttempt += 1;
  entry.retryTimeout = setTimeout(() => {
    entry.retryTimeout = null;
    const current = entries.get(channelName);
    if (!current || current.listeners.size === 0) return;
    current.channel.subscribe((status) => handleStatus(channelName, status));
  }, delay);
}

function handleStatus(channelName: string, status: string) {
  const entry = entries.get(channelName);
  if (!entry) return;

  entry.status = status;
  if (status === "SUBSCRIBED") {
    entry.retryAttempt = 0;
  } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
    scheduleReconnect(channelName);
  }
}

/** Current subscription status for a channel — "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" | undefined if not open. Used by the diagnostics page. */
export function getChannelStatus(channelName: string): string | undefined {
  return entries.get(channelName)?.status;
}

/** Subscribes `listener` to `channelName`, sharing one physical channel across all callers. Returns an unsubscribe function. */
export function subscribeToChannel(channelName: string, listener: Listener): () => void {
  let entry = entries.get(channelName);

  if (!entry) {
    const supabase = getBrowserClient();
    const channel = supabase.channel(channelName);
    entry = { channel, listeners: new Set(), retryTimeout: null, retryAttempt: 0, status: "SUBSCRIBING" };
    entries.set(channelName, entry);

    channel
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        entries.get(channelName)?.listeners.forEach((fn) => fn(event, payload));
      })
      .subscribe((status) => handleStatus(channelName, status));
  }

  entry.listeners.add(listener);

  return () => {
    const current = entries.get(channelName);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      if (current.retryTimeout) clearTimeout(current.retryTimeout);
      const supabase = getBrowserClient();
      supabase.removeChannel(current.channel);
      entries.delete(channelName);
    }
  };
}
