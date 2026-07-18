"use client";

import { useEffect, useRef } from "react";

import { subscribeToChannel } from "@/lib/realtime/manager";
import { isDemoModeClient } from "@/lib/demo/mode";

/**
 * Subscribes to a Supabase Realtime Broadcast channel for the lifetime of
 * the component. `onMessage` doesn't need to be memoized — the latest
 * reference is always used without re-subscribing. Physical channel
 * subscriptions are shared/ref-counted across all callers by the manager,
 * so mounting this hook for the same channel name in multiple components
 * never opens duplicate websocket subscriptions.
 *
 * No-ops entirely in demo mode: writes are disabled there so nothing ever
 * broadcasts, and attempting a real websocket connection would just fail
 * (or retry forever) in a sandboxed/offline demo deployment.
 */
export function useRealtimeChannel(
  channelName: string,
  onMessage: (event: string, payload: unknown) => void
) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (isDemoModeClient()) return;
    return subscribeToChannel(channelName, (event, payload) => handlerRef.current(event, payload));
  }, [channelName]);
}
