"use client";

import { useEffect, useRef } from "react";
import db from "@/lib/instant";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, user, error } = db.useAuth();
  const claimedRef = useRef(false);

  // On login, claim any participant records matching this user's email
  // and seed an example contract if they don't have one
  useEffect(() => {
    if (!user?.id || !user?.email || claimedRef.current) return;
    claimedRef.current = true;
    const body = JSON.stringify({ userId: user.id, email: user.email });
    const headers = { "Content-Type": "application/json" };
    fetch("/api/claim-participant", {
      method: "POST",
      headers,
      body,
    }).catch(() => {});
    fetch("/api/seed-example", {
      method: "POST",
      headers,
      body,
    }).catch(() => {});
  }, [user?.id, user?.email]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-destructive text-sm">{error.message}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen">
        <header className="flex justify-end p-4">
          <ThemeToggle />
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="page-enter">
            <LoginForm />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
