import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCookieGet, mockRedirect, mockVerifySession, mockIsDemoMode } = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  mockVerifySession: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));
vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "prime_session",
  verifySession: (token: string) => mockVerifySession(token),
}));
vi.mock("@/lib/demo/mode", () => ({
  isDemoMode: () => mockIsDemoMode(),
}));

import { getSession, requireAdmin, requireEmployee, requireSession } from "@/lib/auth/guards";

const ADMIN_SESSION = { employeeId: "admin-1", username: "admin", fullName: "Rana Al-Fadhli", role: "admin" as const };
const EMPLOYEE_SESSION = {
  employeeId: "emp-1",
  username: "hassan",
  fullName: "Hassan Youssef",
  role: "employee" as const,
};

beforeEach(() => {
  mockCookieGet.mockReset();
  mockRedirect.mockClear();
  mockVerifySession.mockReset();
  mockIsDemoMode.mockReset();
  mockIsDemoMode.mockReturnValue(false);
});

describe("Permissions — requireAdmin", () => {
  it("returns the session for an admin", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    mockVerifySession.mockResolvedValue(ADMIN_SESSION);
    await expect(requireAdmin()).resolves.toEqual(ADMIN_SESSION);
  });

  it("redirects to /login when there's no session cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects an employee to /employee rather than granting admin access", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    mockVerifySession.mockResolvedValue(EMPLOYEE_SESSION);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/employee");
  });

  it("redirects to /login when the token fails verification", async () => {
    mockCookieGet.mockReturnValue({ value: "tampered-token" });
    mockVerifySession.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("Permissions — requireEmployee", () => {
  it("returns the session for a non-admin employee", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    mockVerifySession.mockResolvedValue(EMPLOYEE_SESSION);
    await expect(requireEmployee()).resolves.toEqual(EMPLOYEE_SESSION);
  });

  it("redirects an admin to /dashboard rather than granting floor access", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    mockVerifySession.mockResolvedValue(ADMIN_SESSION);
    await expect(requireEmployee()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("redirects to /login when unauthenticated", async () => {
    mockCookieGet.mockReturnValue(undefined);
    await expect(requireEmployee()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("Permissions — requireSession", () => {
  it("returns the session for any authenticated role", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    mockVerifySession.mockResolvedValue(EMPLOYEE_SESSION);
    await expect(requireSession()).resolves.toEqual(EMPLOYEE_SESSION);
  });

  it("returns the session for an admin too", async () => {
    mockCookieGet.mockReturnValue({ value: "token" });
    mockVerifySession.mockResolvedValue(ADMIN_SESSION);
    await expect(requireSession()).resolves.toEqual(ADMIN_SESSION);
  });

  it("redirects to /login when unauthenticated", async () => {
    mockCookieGet.mockReturnValue(undefined);
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("Permissions — getSession", () => {
  it("returns null when there is no cookie (does not redirect)", async () => {
    mockCookieGet.mockReturnValue(undefined);
    await expect(getSession()).resolves.toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns null when the token fails verification", async () => {
    mockCookieGet.mockReturnValue({ value: "bad" });
    mockVerifySession.mockResolvedValue(null);
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns the verified session payload when the token is valid", async () => {
    mockCookieGet.mockReturnValue({ value: "good" });
    mockVerifySession.mockResolvedValue(ADMIN_SESSION);
    await expect(getSession()).resolves.toEqual(ADMIN_SESSION);
  });
});

describe("Permissions — Demo Mode bypass", () => {
  it("requireAdmin returns a synthetic admin session without ever checking cookies", async () => {
    mockIsDemoMode.mockReturnValue(true);
    const session = await requireAdmin();
    expect(session.role).toBe("admin");
    expect(mockCookieGet).not.toHaveBeenCalled();
  });

  it("requireEmployee returns a synthetic employee session without ever checking cookies", async () => {
    mockIsDemoMode.mockReturnValue(true);
    const session = await requireEmployee();
    expect(session.role).toBe("employee");
    expect(mockCookieGet).not.toHaveBeenCalled();
  });
});
