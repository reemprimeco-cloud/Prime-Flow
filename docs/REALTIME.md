# Realtime architecture

## Why Broadcast, not Postgres Changes

Auth is custom (no Supabase Auth), so there's no `auth.uid()` for RLS-gated Postgres Changes to key off of. Supabase **Realtime Broadcast** sidesteps that entirely: the server sends the event explicitly after a successful mutation, and clients subscribe with the anon key — no table SELECT grants needed, and RLS stays locked down (see `ARCHITECTURE.md`).

## Sending: `lib/realtime/channels.ts`

```ts
await broadcast(CHANNELS.production, "order.updated", { orderId });
```

`broadcast()` sends over REST (`channel.httpSend`) — no open websocket needed from a short-lived Server Action — and **never throws**. A dropped realtime event must never fail the mutation that triggered it; a failure is logged and swallowed.

Three channels, defined once in `lib/realtime/constants.ts` (deliberately not `server-only`, so both the server sender and client subscribers can import the same names):

| Channel | Fired on |
|---|---|
| `production` | order created/updated/deleted, status changed, note added |
| `material-requests` | material request submitted |
| `notifications` | material request submitted (drives future manager alerts) |

Payloads carry only an ID (`{ orderId }`) — never the full row. Receivers refetch via a Server Action instead of trusting the broadcast payload, so realtime is a "something changed, go refetch" signal, not a source of truth.

## Receiving: multiplexed subscriptions

`lib/realtime/manager.ts` is the single point where the browser opens Realtime channels. Every `useRealtimeChannel(channelName, onMessage)` call (`lib/realtime/use-realtime-channel.ts`) — used identically by the Manager, Employee, and TV dashboards — goes through `subscribeToChannel()`, which:

- **Ref-counts listeners per channel name.** The first subscriber to `"production"` opens the physical `RealtimeChannel`; every subsequent subscriber to the same name is added to that channel's listener set instead of opening a second websocket subscription. The last listener leaving triggers `supabase.removeChannel()` and the entry is deleted — this is what prevents both duplicate subscriptions and memory leaks.
- **Reconnects on channel-level failure.** If a channel's status drops to `CHANNEL_ERROR` or `TIMED_OUT` while it still has listeners, `scheduleReconnect()` retries `channel.subscribe()` with exponential backoff capped at 15s. This is on top of (not instead of) the Supabase socket's own transport-level reconnect — it covers channel handshake failures that can happen independently of the underlying websocket.
- **Never subscribes with zero listeners.** Reconnect attempts check `listeners.size` before firing, so a channel that's already been torn down doesn't keep retrying in the background.

```
useRealtimeChannel("production", cb1)  ─┐
useRealtimeChannel("production", cb2)  ─┼─▶ one RealtimeChannel, two listeners
useRealtimeChannel("material-requests", cb3) ─▶ separate RealtimeChannel
```

Each dashboard's client component (`components/manager/dashboard-client.tsx`, `components/employee/employee-dashboard-client.tsx`, `components/tv/tv-dashboard-client.tsx`) subscribes to `production` and `material-requests`, and on any event invalidates the relevant TanStack Query keys — the actual refetch, cache update, and re-render is handled by Query, not by the realtime layer.

## Fallback

The TV Dashboard's `useQuery` also sets `refetchInterval: 60_000` as a safety net for the unattended kiosk case, in case a broadcast is missed while no one's there to notice a stale screen. Manager and Employee rely on realtime invalidation alone (plus a manual refresh button on Employee, and query-key changes whenever filters change on Manager) — acceptable since a human is present to notice and retry if something looks stale.
