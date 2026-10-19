import "server-only";

import { after } from "next/server";

/**
 * Runs `task` once the response has been sent, so the person who clicked
 * the button isn't kept waiting on its side effects: the customer WhatsApp
 * (a round trip to Twilio in the US), employee pings, the audit row, and the
 * realtime broadcast that refreshes everyone else's board. The data change
 * itself (status, assignments, history) is always written before this runs.
 *
 * Measured on production before this existed: a dashboard "Start Production"
 * click took 3–6.5 s, almost all of it spent here rather than in the update.
 *
 * Outside a request (unit tests, scripts) `after()` throws; the task then
 * runs inline instead, so behaviour and test expectations stay the same.
 * Errors are logged and swallowed either way — a failed notification must
 * never undo or fail the change that already happened.
 */
export async function runAfterResponse(label: string, task: () => Promise<unknown>): Promise<void> {
  const safeTask = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[after-response] ${label} failed`, error);
    }
  };

  try {
    after(safeTask);
  } catch {
    await safeTask();
  }
}
