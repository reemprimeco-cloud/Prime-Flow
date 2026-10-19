import { describe, expect, it } from "vitest";

import { isBlockedByDesignApproval } from "./domain";

describe("isBlockedByDesignApproval", () => {
  it("blocks a new order while the design link is out or changes were requested", () => {
    expect(isBlockedByDesignApproval("new", "pending")).toBe(true);
    expect(isBlockedByDesignApproval("new", "changes_requested")).toBe(true);
  });

  it("doesn't block when no approval was asked for, or it was given", () => {
    expect(isBlockedByDesignApproval("new", "not_sent")).toBe(false);
    expect(isBlockedByDesignApproval("new", "approved")).toBe(false);
  });

  it("only applies before production starts", () => {
    expect(isBlockedByDesignApproval("in_progress", "pending")).toBe(false);
    expect(isBlockedByDesignApproval("ready_pickup", "changes_requested")).toBe(false);
  });
});
