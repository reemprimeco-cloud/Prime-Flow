import "server-only";

import { SignJWT, jwtVerify } from "jose";

import type { EmployeeRole } from "@/types/database.types";

export const SESSION_COOKIE = "prime_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // ~12h shift

export interface SessionPayload {
  employeeId: string;
  username: string;
  fullName: string;
  role: EmployeeRole;
}

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing SESSION_SECRET environment variable.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.employeeId !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.fullName !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      employeeId: payload.employeeId,
      username: payload.username,
      fullName: payload.fullName,
      role: payload.role as EmployeeRole,
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_DURATION_SECONDS;
