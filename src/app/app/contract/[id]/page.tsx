"use client";

import { useState, useCallback, useMemo, useRef, use } from "react";
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
import { InlineDiffView } from "@/components/inline-diff-view";
import { CommitDetailDialog } from "@/components/commit-detail-dialog";
import { SignDialog } from "@/components/sign-dialog";
import { displayName, assignParticipantColors } from "@/lib/utils";

type Mode = "view" | "edit";

function ContractEditor({ contractId }: { contractId: string }) {
  const { user } = db.useAuth();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tractOpen, setTractOpen] = useState(false);
  const [commitDetailOpen, setCommitDetailOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [viewingCommitId, setViewingCommitId] = useState<string | null>(null);
  const [tractStatus, setTractStatus] = useState<
    | { state: "working"; prompt: string }
    | { state: "done"; prompt: string }
    | { state: "error"; prompt: string; error: string }
    | null
  >(null);

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
  const colorMap = useMemo(() => assignParticipantColors(participants), [participants]);

  const myParticipant = participants.find(
    (p) => p.user?.id === user?.id
  );
  const myHeadCommitId = myParticipant?.headCommitId;
  const headCommit = commits.find((c) => c.id === myHeadCommitId);

  // Which commit are we currently looking at?
  const activeCommitId = viewingCommitId ?? myHeadCommitId;
  const activeCommit = commits.find((c) => c.id === activeCommitId);
  const activeParentCommit = activeCommit?.parent?.id
    ? commits.find((c) => c.id === activeCommit.parent!.id) ?? null
    : null;
  const isViewingHistory = viewingCommitId !== null && viewingCommitId !== myHeadCommitId;

  // Consensus: all participants point to the same commit
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
    setCommitError("");

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
        if (!res.ok) throw new Error("Failed to generate description");
        const data = await res.json();
        if (!data.message) throw new Error("Empty description returned");
        msg = data.message;
      } catch (e) {
        setSaving(false);
        setCommitError(
          e instanceof Error ? e.message : "Could not generate commit description. Please enter one manually.",
        );
        return;
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

  // Tract AI: background generation + commit
  async function handleTractSubmit(prompt: string) {
    if (!myParticipant || !myHeadCommitId) return;
    const requesterName = displayName(user?.email, user?.id);
    const baseContent = headCommit?.content ?? "";

    setTractStatus({ state: "working", prompt });

    try {
      const res = await fetch("/api/tract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: baseContent,
          prompt,
          contractName: contract!.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate");
      }

      const data = await res.json();
      const truncatedPrompt = prompt.length > 120 ? prompt.slice(0, 120) + "..." : prompt;
      const fullMsg = `${data.message}\n\nWritten as per ${requesterName}'s request: "${truncatedPrompt}"`;

      const newCommitId = id();
      await db.transact([
        db.tx.commits[newCommitId]
          .update({
            content: data.content,
            message: fullMsg,
            createdAt: Date.now(),
          })
          .link({ contract: contractId })
          .link({ parent: myHeadCommitId }),
      ]);

      setTractStatus({ state: "done", prompt });
      setTimeout(() => setTractStatus(null), 4000);
    } catch (e) {
      setTractStatus({
        state: "error",
        prompt,
        error: e instanceof Error ? e.message : "Something went wrong",
      });
    }
  }

  // Sign this contract (save legal name + drawn signature for PDF)
  async function handleSign(legalName: string, signatureData: string) {
    if (!myParticipant) return;
    await db.transact([
      db.tx.participants[myParticipant.id].update({
        legalName,
        signatureData,
        signedAt: Date.now(),
      }),
    ]);
    // If we were waiting to download, do it now
    if (pendingDownload.current) {
      pendingDownload.current = false;
      downloadPdf(legalName, signatureData);
    }
  }

  const pendingDownload = useRef(false);

  function downloadPdf(legalName?: string, signatureData?: string) {
    if (!contract) return;
    setDownloading(true);
    const sigName = legalName ?? myParticipant?.legalName;
    const sigData = signatureData ?? myParticipant?.signatureData;
    fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: contract.name,
        content: displayContent,
        signature: sigName && sigData ? { legalName: sigName, signatureData: sigData, signedAt: myParticipant?.signedAt ?? Date.now() } : undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("PDF generation failed");
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${contract!.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => console.error("PDF download failed:", e))
      .finally(() => setDownloading(false));
  }

  async function handleDownloadPdf() {
    if (!contract) return;
    // If no signature saved yet, prompt to draw one first
    if (!myParticipant?.signatureData) {
      pendingDownload.current = true;
      setSignOpen(true);
      return;
    }
    downloadPdf();
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (!contract || !myParticipant) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Contract not found, or you don&apos;t have access.
        </p>
        <Button variant="outline" onClick={() => router.push("/app")}>
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
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
              className="text-xl font-semibold tracking-tight cursor-pointer hover:text-accent transition-colors truncate"
              onClick={() => {
                setNameValue(contract.name);
                setEditingName(true);
              }}
              title="Click to rename"
            >
              {contract.name}
            </h1>
          )}
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {isViewingHistory
              ? `Viewing: ${activeCommitId?.slice(0, 7)} (not your current version)`
              : `Your version: ${myHeadCommitId?.slice(0, 7) ?? "none"}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTractOpen(true)}
            disabled={tractStatus?.state === "working"}
          >
            Ask Tract
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={downloading || !displayContent.trim()}
          >
            {downloading ? "Generating..." : "Download PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        {/* Main content area */}
        <div className="space-y-4">
          {/* Tract AI status banner */}
          {tractStatus && (
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-opacity ${
                tractStatus.state === "working"
                  ? "border-accent/30 bg-accent/5"
                  : tractStatus.state === "done"
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <span
                className="inline-flex items-center justify-center w-5 h-5 shrink-0 rounded text-[10px] font-bold"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-accent), color-mix(in oklch, var(--color-accent) 60%, #6d9eeb))",
                  color: "white",
                }}
              >
                T
              </span>
              <div className="flex-1 min-w-0">
                {tractStatus.state === "working" && (
                  <p className="text-muted-foreground">
                    Tract is working on your request:{" "}
                    <span className="text-foreground">&ldquo;{tractStatus.prompt}&rdquo;</span>
                  </p>
                )}
                {tractStatus.state === "done" && (
                  <p className="text-green-600 dark:text-green-400">
                    Tract finished &mdash; new version available in the commit history
                  </p>
                )}
                {tractStatus.state === "error" && (
                  <div>
                    <p className="text-red-600 dark:text-red-400">
                      Tract failed: {tractStatus.error}
                    </p>
                    <button
                      className="text-xs text-muted-foreground underline mt-1"
                      onClick={() => setTractStatus(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
              {tractStatus.state === "working" && (
                <div className="shrink-0 w-4 h-4 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
              )}
            </div>
          )}

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
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-accent/20 bg-accent/5">
                    <Input
                      className="flex-1 text-sm h-9"
                      placeholder="Description (auto-generated if empty)"
                      value={commitMsg}
                      onChange={(e) => {
                        setCommitMsg(e.target.value);
                        setCommitError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommit();
                      }}
                    />
                    <Button size="sm" onClick={handleCommit} disabled={saving}>
                      {saving ? "Saving..." : "Commit"}
                    </Button>
                  </div>
                  {commitError && (
                    <div className="text-xs text-red-500 px-3">
                      {commitError}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {/* Approval indicator */}
              {approvers.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
                  {approvers.map((p) => (
                    <span
                      key={`dot-${p.id}`}
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: colorMap.get(p.id) ?? "var(--color-muted-foreground)" }}
                    />
                  ))}
                  This is{" "}
                  {approvers.map((p, i) => {
                    const isMe = p.user?.id === user?.id;
                    const pColor = colorMap.get(p.id);
                    const label = isMe ? "your" : `${displayName(p.email, p.user?.id)}'s`;
                    return (
                      <span key={p.id}>
                        {i > 0 && (i === approvers.length - 1 ? " and " : ", ")}
                        <span title={p.email || undefined} style={pColor ? { color: pColor } : undefined}>{label}</span>
                      </span>
                    );
                  })}{" "}
                  version
                  {approvers.length === participants.length && participants.length >= 2 && (
                    <Badge variant="default" className="text-[10px] bg-green-600/90 text-white ml-1">
                      🎉 Consensus
                    </Badge>
                  )}
                </div>
              )}

              {/* Last commit note */}
              {activeCommit?.message && !isViewingHistory && (
                <p className="text-xs text-muted-foreground px-1 italic">{activeCommit.message}</p>
              )}

              {/* Adopt bar — shown when viewing a historical commit */}
              {isViewingHistory && (
                <div className="space-y-2 p-3 rounded-lg border border-accent/30 bg-accent/5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Viewing commit <span className="font-mono">{activeCommitId?.slice(0, 7)}</span>
                      {activeCommit?.author?.email
                        ? <> by <span title={activeCommit.author.email}>{displayName(activeCommit.author.email)}</span></>
                        : " by Tract"}
                    </p>
                    <Button size="sm" onClick={() => handleCheckout(activeCommitId!)}>
                      Adopt this version
                    </Button>
                  </div>
                  {activeCommit?.message && (
                    <p className="text-xs text-muted-foreground italic">{activeCommit.message}</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setCommitDetailOpen(true)}
                  >
                    View changes from parent
                  </Button>
                </div>
              )}

              <div className="min-h-[500px] p-6 rounded-lg border border-border bg-card">
                {isViewingHistory ? (
                  <InlineDiffView
                    baseContent={headCommit?.content ?? ""}
                    compareContent={activeCommit?.content ?? ""}
                  />
                ) : (
                  <MarkdownView content={displayContent} />
                )}
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
            onSelectVersion={handleSelectCommit}
            colorMap={colorMap}
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
            colorMap={colorMap}
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
        onSubmit={handleTractSubmit}
      />

      <CommitDetailDialog
        commit={activeCommit ?? null}
        parentCommit={activeParentCommit}
        open={commitDetailOpen}
        onOpenChange={setCommitDetailOpen}
      />

      <SignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        onSign={handleSign}
        existingName={myParticipant?.legalName ?? undefined}
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
