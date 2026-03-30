"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";

function DashboardContent() {
  const { user } = db.useAuth();
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = db.useQuery({
    participants: {
      contract: {
        commits: {},
        participants: {
          user: {},
        },
        owner: {},
      },
      $: {
        where: {
          "user.id": user?.id ?? "",
        },
      },
    },
  });

  const contracts = (data?.participants ?? [])
    .filter((p) => p.contract)
    .map((p) => ({
      ...p.contract!,
      myRole: p.role,
      myHeadCommitId: p.headCommitId,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !user) return;
    setCreating(true);

    const contractId = id();
    const commitId = id();
    const participantId = id();

    await db.transact([
      db.tx.contracts[contractId]
        .update({
          name: newName.trim(),
          createdAt: Date.now(),
        })
        .link({ owner: user.id }),
      db.tx.commits[commitId]
        .update({
          content: "",
          message: "Initial draft",
          createdAt: Date.now(),
        })
        .link({ contract: contractId })
        .link({ author: user.id }),
      db.tx.participants[participantId]
        .update({
          role: "owner",
          headCommitId: commitId,
          email: user.email ?? "",
          joinedAt: Date.now(),
        })
        .link({ contract: contractId })
        .link({ user: user.id }),
    ]);

    setDialogOpen(false);
    setNewName("");
    setCreating(false);
    router.push(`/app/contract/${contractId}`);
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {contracts.length === 0
              ? "Create your first contract to get started."
              : `${contracts.length} contract${contracts.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            New contract
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New contract</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                placeholder="Contract name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {contracts.length > 0 && (
        <div className="space-y-2">
          {contracts.map((contract) => {
            const participantCount = contract.participants?.length ?? 0;
            const commitCount = contract.commits?.length ?? 0;

            return (
              <button
                key={contract.id}
                onClick={() => router.push(`/app/contract/${contract.id}`)}
                className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-ring/30 hover:bg-secondary/50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-sm group-hover:text-accent transition-colors">
                      {contract.name}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{commitCount} commit{commitCount !== 1 ? "s" : ""}</span>
                      <span>{participantCount} participant{participantCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <Badge
                    variant={contract.myRole === "owner" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {contract.myRole}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <AppShell>
        <DashboardContent />
      </AppShell>
    </AuthGate>
  );
}
