"use client";

import React, { use, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

function JoinView({ participantId }: { participantId: string }) {
  const { user } = db.useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"joining" | "success" | "error">("joining");
  const [errorMsg, setErrorMsg] = useState("");
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!user?.id || joinedRef.current) return;
    joinedRef.current = true;

    const userId = user.id;
    const email = user.email;

    async function joinContract() {
      try {
        const res = await fetch("/api/join-by-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId,
            userId,
            email,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to join contract");
        }

        const data = await res.json();
        setStatus("success");
        router.push(`/app/contract/${data.contractId}`);
      } catch (err) {
        console.error("Error joining contract by link:", err);
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Failed to join contract");
      }
    }

    joinContract();
  }, [user, participantId, router]);

  if (status === "joining") {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="shrink-0 w-8 h-8 border-4 border-accent/40 border-t-accent rounded-full animate-spin" />
        <h2 className="text-lg font-medium animate-pulse">Joining contract...</h2>
        <p className="text-sm text-muted-foreground">We are adding you as a participant to the contract.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="rounded-full bg-destructive/10 p-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-lg font-medium text-destructive">Could not join contract</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {errorMsg}
        </p>
        <Button variant="outline" onClick={() => router.push("/app")}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <h2 className="text-lg font-medium text-green-600 dark:text-green-400">Success!</h2>
      <p className="text-sm text-muted-foreground">Redirecting you to the contract...</p>
    </div>
  );
}

export default function InvitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: participantId } = use(params);

  return (
    <AuthGate>
      <AppShell>
        <JoinView participantId={participantId} />
      </AppShell>
    </AuthGate>
  );
}
