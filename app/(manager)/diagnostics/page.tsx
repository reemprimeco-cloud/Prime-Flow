import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { getDiagnosticsSnapshot } from "@/lib/actions/diagnostics";
import { DiagnosticsClient } from "@/components/manager/diagnostics-client";

export const metadata: Metadata = {
  title: "Diagnostics — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  await requireAdmin();
  const snapshot = await getDiagnosticsSnapshot();

  return <DiagnosticsClient initialSnapshot={snapshot} />;
}
