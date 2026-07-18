"use client";

import { useEffect, useRef } from "react";

import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribes to a Supabase Realtime Broadcast channel for the lifetime of
 * the component. `onMessage` doesn't need to be memoized — the latest
 * reference is always used without re-subscribing.
 */
export function useRealtimeChannel(
  channelName: string,
  onMessage: (event: string, payload: unknown) => void
) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        handlerRef.current(event, payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName]);
}
