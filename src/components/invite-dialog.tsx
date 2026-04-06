"use client";

import { useState, useMemo } from "react";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displayName } from "@/lib/utils";

interface InviteDialogProps {
  contractId: string;
  myHeadCommitId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteDialog({
  contractId,
  myHeadCommitId,
  open,
  onOpenChange,
}: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  const { data } = db.useQuery({
    contracts: {
      commits: { author: {} },
      $: { where: { id: contractId } },
    },
  });

  const contract = data?.contracts?.[0];
  const commits = contract?.commits ?? [];

  // Sort newest first
  const sortedCommits = useMemo(
    () => [...commits].sort((a, b) => b.createdAt - a.createdAt),
    [commits],
  );

  // Default to inviter's head, fall back to latest commit
  const effectiveCommitId =
    selectedCommitId ?? myHeadCommitId ?? sortedCommits[0]?.id;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !effectiveCommitId) return;
    setError(null);
    setSending(true);

    try {
      const participantId = id();
      await db.transact([
        db.tx.participants[participantId]
          .update({
            role: "collaborator",
            headCommitId: effectiveCommitId,
            email: email.trim().toLowerCase(),
            joinedAt: Date.now(),
          })
          .link({ contract: contractId }),
      ]);

      setEmail("");
      setSelectedCommitId(null);
      onOpenChange(false);
    } catch {
      setError("Failed to invite. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite participant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleInvite} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            They&apos;ll see this contract when they sign in with this email.
          </p>
          <Input
            type="email"
            placeholder="participant@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              Starting version
            </label>
            <select
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={effectiveCommitId ?? ""}
              onChange={(e) => setSelectedCommitId(e.target.value)}
            >
              {sortedCommits.map((c) => {
                const isMyHead = c.id === myHeadCommitId;
                const authorLabel = c.author?.email
                  ? displayName(c.author.email)
                  : "Tract";
                const msg = c.message
                  ? c.message.split("\n")[0].slice(0, 50)
                  : "No description";
                return (
                  <option key={c.id} value={c.id}>
                    {c.id.slice(0, 7)} — {msg} ({authorLabel})
                    {isMyHead ? " ← your version" : ""}
                  </option>
                );
              })}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={sending || !effectiveCommitId}
          >
            {sending ? "Inviting..." : "Invite"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
