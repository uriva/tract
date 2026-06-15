"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  const [inviteMethod, setInviteMethod] = useState<"email" | "link">("email");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

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

  // Set the default selected version to myHeadCommitId on open
  useEffect(() => {
    if (open) {
      setEmail("");
      setSelectedCommitId(myHeadCommitId ?? null);
      setError(null);
      setInviteLink(null);
      setCopiedLink(false);
      setInviteMethod("email");
    }
  }, [open, myHeadCommitId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCommitId) return;

    if (inviteMethod === "email" && !email.trim()) return;

    setError(null);
    setSending(true);

    try {
      const participantId = id();
      
      const updateData: any = {
        role: "collaborator",
        headCommitId: selectedCommitId,
        joinedAt: Date.now(),
      };

      if (inviteMethod === "email") {
        updateData.email = email.trim().toLowerCase();
      }

      await db.transact([
        db.tx.participants[participantId]
          .update(updateData)
          .link({ contract: contractId }),
      ]);

      if (inviteMethod === "email") {
        setEmail("");
        setSelectedCommitId(null);
        onOpenChange(false);
      } else {
        const link = `${window.location.origin}/invite/${participantId}`;
        setInviteLink(link);
      }
    } catch {
      setError(inviteMethod === "email" ? "Failed to invite. Try again." : "Failed to generate link. Try again.");
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

        {!inviteLink ? (
          <form onSubmit={handleInvite} className="space-y-4">
            {/* Tab switch */}
            <div className="flex border-b border-border">
              <button
                type="button"
                className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                  inviteMethod === "email"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setInviteMethod("email")}
              >
                Invite by Email
              </button>
              <button
                type="button"
                className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                  inviteMethod === "link"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setInviteMethod("link")}
              >
                Invite by Link
              </button>
            </div>

            {inviteMethod === "email" ? (
              <>
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
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Generate a unique invite link. Anyone with the link will be able to join and collaborate.
              </p>
            )}

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
              {sending ? "Processing..." : inviteMethod === "email" ? "Invite" : "Generate Invite Link"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground font-medium">
                Invite link generated!
              </p>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can join as a collaborator starting from this version.
              </p>
              <div className="flex gap-2 mt-2">
                <Input
                  className="flex-1 font-mono text-xs"
                  value={inviteLink}
                  readOnly
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                >
                  {copiedLink ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
            <Button
              type="button"
              className="w-full mt-2"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
