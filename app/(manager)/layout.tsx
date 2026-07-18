import { requireAdmin } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/demo/mode";
import { ManagerShell } from "@/components/manager/manager-shell";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <ManagerShell fullName={session.fullName} role={session.role} showDemoBanner={isDemoMode()}>
      {children}
    </ManagerShell>
  );
}
