/**
 * Seeds demo employee accounts. Run with `pnpm seed` after applying
 * migrations and setting SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

import type { Database } from "../types/database.types";

const DEMO_EMPLOYEES: {
  username: string;
  password: string;
  full_name: string;
  role: Database["public"]["Tables"]["employees"]["Row"]["role"];
  phone: string;
}[] = [
  { username: "admin", password: "PrimeAdmin!25", full_name: "Rana Al-Fadhli", role: "admin", phone: "+96550001111" },
  { username: "hassan", password: "PrimeFloor!25", full_name: "Hassan Youssef", role: "employee", phone: "+96550002222" },
  { username: "mariam", password: "PrimeFloor!25", full_name: "Mariam Khalid", role: "employee", phone: "+96550003333" },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const employee of DEMO_EMPLOYEES) {
    const password_hash = await bcrypt.hash(employee.password, 12);
    const { error } = await supabase
      .from("employees")
      .upsert(
        {
          username: employee.username,
          password_hash,
          full_name: employee.full_name,
          role: employee.role,
          phone: employee.phone,
          active: true,
        },
        { onConflict: "username" }
      );

    if (error) {
      console.error(`Failed to seed ${employee.username}:`, error.message);
      process.exitCode = 1;
      continue;
    }
    console.log(`Seeded ${employee.role.padEnd(9)} ${employee.username} / ${employee.password}`);
  }
}

main();
