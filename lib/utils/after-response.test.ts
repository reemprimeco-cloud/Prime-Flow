import { beforeEach, describe, expect, it, vi } from "vitest";

const { scheduled, inRequest } = vi.hoisted(() => ({ scheduled: [] as (() => unknown)[], inRequest: { value: true } }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => {
    if (!inRequest.value) throw new Error("`after` was called outside a request scope.");
    scheduled.push(task);
  },
}));

import { runAfterResponse } from "./after-response";

beforeEach(() => {
  scheduled.length = 0;
  inRequest.value = true;
});

describe("runAfterResponse", () => {
  it("returns before the task runs when inside a request, and runs it after", async () => {
    const task = vi.fn(async () => {});
    await runAfterResponse("test", task);
    expect(task).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs the task inline outside a request (tests, scripts)", async () => {
    inRequest.value = false;
    const task = vi.fn(async () => {});
    await runAfterResponse("test", task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("logs and swallows a failing task instead of throwing", async () => {
    inRequest.value = false;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runAfterResponse("notify", async () => { throw new Error("twilio down"); })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("[after-response] notify failed", expect.any(Error));
    errorSpy.mockRestore();
  });
});
