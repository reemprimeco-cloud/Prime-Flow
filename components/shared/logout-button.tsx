"use client";

import { LogOut } from "lucide-react";

import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm" className={cn("gap-2 text-muted-foreground", className)}>
        <LogOut />
        Log out
      </Button>
    </form>
  );
}
