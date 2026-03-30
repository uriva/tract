"use client";

import { useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { ParticipantList } from "@/components/participant-list";
import { CommitLog } from "@/components/commit-log";
import { InviteDialog } from "@/components/invite-dialog";
import { TractDialog } from "@/components/tract-dialog";
import { MarkdownView } from "@/components/markdown-view";

type Mode = "view" | "edit";

function ContractEditor({ contractId }: { contractId: string }) {
  const { user } = db.useAuth();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tractOpen, setTractOpen] = useState(false);
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

  // Consensus: all participants point to the same commit
  const headIds = participants.map((p) => p.headCommitId).filter(Boolean);
  const allInConsensus =
    participants.length >= 2 &&
    headIds.length === participants.length &&
    new Set(headIds).size === 1;

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

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

    let msg = commitMsg.trim();
    if (!msg) {
      try {
        const res = await fetch("/api/commit-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldContent: headCommit?.content ?? "",
            newContent: content,
          }),
        });
        const data = await res.json();
        msg = data.message || "Update contract";
      } catch {
        msg = "Update contract";
      }
    }

    const newCommitId = id();

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
  }, [hasChanges, user, myParticipant, content, commitMsg, contractId, myHeadCommitId, headCommit]);

  async function handleNameSave() {
    const trimmed = nameValue.trim();
    if (!trimmed || !contract || trimmed === contract.name) {
      setEditingName(false);
      return;
    }
    await db.transact([
      db.tx.contracts[contract.id].update({ name: trimmed }),
    ]);
    setEditingName(false);
  }

  // Tract AI creates a commit parented on the user's current version
  async function handleTractCommit(newContent: string, message: string) {
    if (!myParticipant || !myHeadCommitId) return;
    const newCommitId = id();
    await db.transact([
      db.tx.commits[newCommitId]
        .update({
          content: newContent,
          message,
          createdAt: Date.now(),
        })
        .link({ contract: contractId })
        .link({ parent: myHeadCommitId }),
    ]);
    // Don't move anyone's pointer — Tract has no version.
    // The commit just exists in the DAG for anyone to adopt.
  }

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

  // Who approves the currently displayed version?
  const approvers = activeCommitId
    ? participants.filter((p) => p.headCommitId === activeCommitId)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {editingName ? (
            <input
              className="text-xl font-semibold tracking-tight bg-transparent border-b border-accent outline-none w-full"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameSave();
                if (e.key === "Escape") setEditingName(false);
              }}
              autoFocus
            />
          ) : (
            <h1
              className="text-xl font-semibold tracking-tight cursor-pointer hover:text-accent transition-colors"
              onClick={() => {
                setNameValue(contract.name);
                setEditingName(true);
              }}
              title="Click to rename"
            >
              {contract.name}
            </h1>
          )}
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted-foreground font-mono">
              {isViewingHistory
                ? `Viewing: ${activeCommitId?.slice(0, 7)} (not your current version)`
                : `Your version: ${myHeadCommitId?.slice(0, 7) ?? "none"}`}
            </p>
            {participants.length >= 2 && !allInConsensus && (
              <Badge variant="secondary" className="text-[10px]">
                {`${new Set(headIds).size} version${new Set(headIds).size !== 1 ? "s" : ""}`}
              </Badge>
            )}
          </div>
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
              Back to your version
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setTractOpen(true)}>
            Ask Tract
          </Button>
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
            <div className="space-y-3">
              {/* Approval indicator */}
              {approvers.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500/80" />
                  {approvers.map((p) => {
                    const isMe = p.user?.id === user?.id;
                    return isMe ? "You" : (p.email?.split("@")[0] ?? p.email);
                  }).join(", ")}{" "}
                  {approvers.length === 1 ? "approves" : "approve"} this version
                  {approvers.length === participants.length && participants.length >= 2 && (
                    <Badge variant="default" className="text-[10px] bg-green-600/90 text-white ml-1">
                      Consensus
                    </Badge>
                  )}
                </div>
              )}

              <div className="min-h-[500px] p-6 rounded-lg border border-border bg-card">
                <MarkdownView content={displayContent} />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <ParticipantList
            participants={participants}
            commits={commits}
            currentUserId={user?.id ?? ""}
            contractId={contractId}
            myHeadCommitId={myHeadCommitId}
          />

          <Separator />

          <CommitLog
            commits={commits}
            headCommitId={myHeadCommitId}
            viewingCommitId={activeCommitId}
            participants={participants}
            currentUserId={user?.id ?? ""}
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

      <TractDialog
        open={tractOpen}
        onOpenChange={setTractOpen}
        contractName={contract.name}
        currentContent={headCommit?.content ?? ""}
        onCommit={handleTractCommit}
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
