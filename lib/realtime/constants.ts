/**
 * Broadcast channel names — shared between the server-only broadcast sender
 * (lib/realtime/channels.ts) and client-side subscribers
 * (lib/realtime/use-realtime-channel.ts). No "server-only" import here on
 * purpose so client components can import it directly.
 */
export const CHANNELS = {
  production: "production",
  materialRequests: "material-requests",
  notifications: "notifications",
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
