import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS_TRANSITIONS,
  assertValidTransition,
  canTransition,
  getNextStatuses,
  InvalidStatusTransitionError,
} from "@/lib/status/engine";
import type { OrderStatus } from "@/types/database.types";

const ALL_STATUSES: OrderStatus[] = [
  "new",
  "in_progress",
  "waiting_materials",
  "ready_pickup",
  "ready_delivery",
  "collected",
  "delivered",
  "completed",
];

describe("Status Engine", () => {
  it("declares a transition list for every order status", () => {
    for (const status of ALL_STATUSES) {
      expect(ORDER_STATUS_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(ORDER_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });

  it("allows every transition declared in the graph", () => {
    for (const [from, targets] of Object.entries(ORDER_STATUS_TRANSITIONS) as [OrderStatus, OrderStatus[]][]) {
      for (const to of targets) {
        expect(canTransition(from, to)).toBe(true);
        expect(() => assertValidTransition(from, to)).not.toThrow();
      }
    }
  });

  it("rejects every transition not declared in the graph", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const declared = ORDER_STATUS_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(declared);
        if (!declared) {
          expect(() => assertValidTransition(from, to)).toThrow(InvalidStatusTransitionError);
        }
      }
    }
  });

  it("models the golden path: new -> in_progress -> ready_pickup -> collected -> completed", () => {
    expect(canTransition("new", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "ready_pickup")).toBe(true);
    expect(canTransition("ready_pickup", "collected")).toBe(true);
    expect(canTransition("collected", "completed")).toBe(true);
  });

  it("models the material-request detour: in_progress <-> waiting_materials", () => {
    expect(canTransition("in_progress", "waiting_materials")).toBe(true);
    expect(canTransition("waiting_materials", "in_progress")).toBe(true);
    // waiting_materials can't jump straight to a ready state — must resume production first
    expect(canTransition("waiting_materials", "ready_pickup")).toBe(false);
    expect(canTransition("waiting_materials", "ready_delivery")).toBe(false);
  });

  it("treats completed as terminal", () => {
    expect(getNextStatuses("completed")).toEqual([]);
    for (const to of ALL_STATUSES) {
      expect(canTransition("completed", to)).toBe(false);
    }
  });

  it("never allows skipping backwards or sideways outside the declared graph", () => {
    expect(canTransition("ready_pickup", "ready_delivery")).toBe(false);
    expect(canTransition("collected", "in_progress")).toBe(false);
    expect(canTransition("delivered", "collected")).toBe(false);
    expect(canTransition("new", "completed")).toBe(false);
  });

  it("getNextStatuses returns exactly the declared targets for a status", () => {
    expect(getNextStatuses("new")).toEqual(["in_progress"]);
    expect(getNextStatuses("in_progress").sort()).toEqual(
      ["waiting_materials", "ready_pickup", "ready_delivery"].sort()
    );
  });

  it("InvalidStatusTransitionError carries the attempted from/to and a readable message", () => {
    try {
      assertValidTransition("completed", "new");
      throw new Error("expected assertValidTransition to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStatusTransitionError);
      const err = error as InvalidStatusTransitionError;
      expect(err.from).toBe("completed");
      expect(err.to).toBe("new");
      expect(err.message).toContain("Completed");
    }
  });
});
