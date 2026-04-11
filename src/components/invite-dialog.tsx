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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !selectedCommitId) return;
    setError(null);
    setSending(true);

    try {
      const participantId = id();
      await db.transact([
        db.tx.participants[participantId]
          .update({
            role: "collaborator",
            headCommitId: selectedCommitId,
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
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Which version should they start from?
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-md border border-border p-1">
              {sortedCommits.map((c) => {
                const isMyHead = c.id === myHeadCommitId;
                const authorLabel = c.author?.email
                  ? displayName(c.author.email)
                  : "Tract";
                const msg = c.message
                  ? c.message.split("\n")[0].slice(0, 60)
                  : "No description";
                const isSelected = selectedCommitId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCommitId(c.id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm cursor-pointer transition-colors overflow-hidden ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono text-xs shrink-0 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{c.id.slice(0, 7)}</span>
                      <span className="truncate">{msg}</span>
                    </div>
                    <div className={`text-xs mt-0.5 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      by {authorLabel}
                      {isMyHead && " — your version"}
                    </div>
                  </button>
                );
              })}
            </div>
            {!selectedCommitId && (
              <p className="text-xs text-muted-foreground">Select a version above</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={sending || !selectedCommitId}
          >
            {sending ? "Inviting..." : "Invite"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
