"use client";

import { useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { ParticipantList } from "@/components/participant-list";
import { CommitLog } from "@/components/commit-log";
import { InviteDialog } from "@/components/invite-dialog";
import { MarkdownView } from "@/components/markdown-view";

type Mode = "view" | "edit";

function ContractEditor({ contractId }: { contractId: string }) {
  const { user } = db.useAuth();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [viewingCommitId, setViewingCommitId] = useState<string | null>(null);

  const { data, isLoading } = db.useQuery({
    contracts: {
      commits: {
        author: {},
        parent: {},
      },
      participants: {
        user: {},
      },
      owner: {},
      $: { where: { id: contractId } },
    },
  });

  const contract = data?.contracts?.[0];
  const commits = contract?.commits ?? [];
  const participants = contract?.participants ?? [];

  const myParticipant = participants.find(
    (p) => p.user?.id === user?.id
  );
  const myHeadCommitId = myParticipant?.headCommitId;
  const headCommit = commits.find((c) => c.id === myHeadCommitId);

  // Which commit are we currently looking at?
  const activeCommitId = viewingCommitId ?? myHeadCommitId;
  const activeCommit = commits.find((c) => c.id === activeCommitId);
  const isViewingHistory = viewingCommitId !== null && viewingCommitId !== myHeadCommitId;

  const [content, setContent] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize content from HEAD commit
  if (headCommit && !initialized) {
    setContent(headCommit.content);
    setInitialized(true);
  }

  const hasChanges = initialized && content !== headCommit?.content;

  // When clicking a commit in history
  function handleSelectCommit(commitId: string) {
    if (commitId === myHeadCommitId) {
      // Going back to HEAD
      setViewingCommitId(null);
      setMode("view");
    } else {
      setViewingCommitId(commitId);
      setMode("view"); // Always view when browsing history
    }
  }

  // Move HEAD to a different commit
  async function handleCheckout(commitId: string) {
    if (!myParticipant) return;
    await db.transact([
      db.tx.participants[myParticipant.id].update({
        headCommitId: commitId,
      }),
    ]);
    const targetCommit = commits.find((c) => c.id === commitId);
    if (targetCommit) {
      setContent(targetCommit.content);
    }
    setViewingCommitId(null);
  }

  // Switch to edit mode (always edits HEAD)
  function enterEditMode() {
    setViewingCommitId(null);
    setContent(headCommit?.content ?? "");
    setMode("edit");
  }

  const handleCommit = useCallback(async () => {
    if (!hasChanges || !user || !myParticipant || content === null) return;
    setSaving(true);

    const newCommitId = id();
    const msg = commitMsg.trim() || "Update contract";

    const txs = [
      db.tx.commits[newCommitId]
        .update({
          content,
          message: msg,
          createdAt: Date.now(),
        })
        .link({ contract: contractId })
        .link({ author: user.id }),
      db.tx.participants[myParticipant.id].update({
        headCommitId: newCommitId,
      }),
    ];

    if (myHeadCommitId) {
      txs[0] = db.tx.commits[newCommitId]
        .update({
          content,
          message: msg,
          createdAt: Date.now(),
        })
        .link({ contract: contractId })
        .link({ author: user.id })
        .link({ parent: myHeadCommitId });
    }

    await db.transact(txs);
    setCommitMsg("");
    setSaving(false);
    setMode("view");
  }, [hasChanges, user, myParticipant, content, commitMsg, contractId, myHeadCommitId]);

  if (isLoading || !contract) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (!myParticipant) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You don&apos;t have access to this contract.
        </p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  // The content to display: edit buffer if editing, otherwise the active commit's content
  const displayContent =
    mode === "edit" ? (content ?? "") : (activeCommit?.content ?? "");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{contract.name}</h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {isViewingHistory
              ? `Viewing: ${activeCommitId?.slice(0, 7)} (not your HEAD)`
              : `HEAD: ${myHeadCommitId?.slice(0, 7) ?? "none"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === "view" && !isViewingHistory && (
            <Button size="sm" variant="outline" onClick={enterEditMode}>
              Edit
            </Button>
          )}
          {mode === "edit" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setContent(headCommit?.content ?? "");
                setMode("view");
              }}
            >
              Cancel
            </Button>
          )}
          {isViewingHistory && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setViewingCommitId(null);
                setMode("view");
              }}
            >
              Back to HEAD
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        {/* Main content area */}
        <div className="space-y-4">
          {mode === "edit" ? (
            <>
              <Textarea
                className="contract-editor min-h-[500px] resize-y bg-card border-border focus:border-ring/30"
                value={content ?? ""}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Start writing your contract..."
                autoFocus
              />

              {hasChanges && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-accent/20 bg-accent/5">
                  <Input
                    className="flex-1 text-sm h-9"
                    placeholder="Commit message (optional)"
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCommit();
                    }}
                  />
                  <Button size="sm" onClick={handleCommit} disabled={saving}>
                    {saving ? "Saving..." : "Commit"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="min-h-[500px] p-6 rounded-lg border border-border bg-card">
              <MarkdownView content={displayContent} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <ParticipantList
            participants={participants}
            currentUserId={user?.id ?? ""}
            contractId={contractId}
            myHeadCommitId={myHeadCommitId}
          />

          <Separator />

          <CommitLog
            commits={commits}
            headCommitId={myHeadCommitId}
            viewingCommitId={activeCommitId}
            onSelectCommit={handleSelectCommit}
            onCheckout={handleCheckout}
          />
        </div>
      </div>

      <InviteDialog
        contractId={contractId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}

export default function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: contractId } = use(params);

  return (
    <AuthGate>
      <AppShell>
        <ContractEditor contractId={contractId} />
      </AppShell>
    </AuthGate>
  );
}
