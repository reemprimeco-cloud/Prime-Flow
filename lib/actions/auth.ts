"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

export interface LoginResult {
  error: string;
}

const GENERIC_LOGIN_ERROR = "Incorrect username or password.";

export async function login(input: { username: string; password: string }): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  const supabase = createServiceClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, username, password_hash, full_name, role, active")
    .eq("username", parsed.data.username)
    .maybeSingle();

  if (!employee || !employee.active) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  const passwordMatches = await verifyPassword(parsed.data.password, employee.password_hash);
  if (!passwordMatches) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  const token = await signSession({
    employeeId: employee.id,
    username: employee.username,
    fullName: employee.full_name,
    role: employee.role,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect(employee.role === "admin" ? "/dashboard" : "/employee");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
