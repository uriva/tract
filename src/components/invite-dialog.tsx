"use client";

import { useState } from "react";
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

interface InviteDialogProps {
  contractId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteDialog({ contractId, open, onOpenChange }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the contract's initial commit (root commit) to set as the invitee's HEAD
  const { data } = db.useQuery({
    contracts: {
      commits: {},
      $: { where: { id: contractId } },
    },
  });

  const contract = data?.contracts?.[0];
  const commits = contract?.commits ?? [];
  // Find root commit (the one with no parent - earliest commit)
  const rootCommit = commits.length > 0
    ? commits.reduce((earliest, c) => c.createdAt < earliest.createdAt ? c : earliest, commits[0])
    : null;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !rootCommit) return;
    setError(null);
    setSending(true);

    try {
      const participantId = id();
      await db.transact([
        db.tx.participants[participantId]
          .update({
            role: "collaborator",
            headCommitId: rootCommit.id,
            email: email.trim().toLowerCase(),
            joinedAt: Date.now(),
          })
          .link({ contract: contractId }),
      ]);

      setEmail("");
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
            Their HEAD will start at the initial commit.
          </p>
          <Input
            type="email"
            placeholder="participant@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={sending || !rootCommit}>
            {sending ? "Inviting..." : "Invite"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
