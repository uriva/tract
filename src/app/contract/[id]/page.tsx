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
import { InlineDiffView } from "@/components/inline-diff-view";
import { CommitDetailDialog } from "@/components/commit-detail-dialog";

type Mode = "view" | "edit";

function ContractEditor({ contractId }: { contractId: string }) {
  const { user } = db.useAuth();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tractOpen, setTractOpen] = useState(false);
  const [commitDetailOpen, setCommitDetailOpen] = useState(false);
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

  async function handleDownloadPdf() {
    if (!contract) return;
    setDownloading(true);
    try {
      const { marked } = await import("marked");
      const html2pdf = (await import("html2pdf.js")).default;

      const bodyHtml = await marked.parse(displayContent);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div style="font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; line-height: 1.7; font-size: 14px; padding: 8px;">
          <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px 0; color: #111;">${contract.name}</h1>
          <div>${bodyHtml}</div>
        </div>
      `;

      // Force all elements to simple colors so html2canvas doesn't choke on oklch/lab
      wrapper.querySelectorAll("*").forEach((el) => {
        const s = (el as HTMLElement).style;
        if (!s.color) s.color = "#1a1a1a";
        if (!s.borderColor) s.borderColor = "#d1d5db";
      });

      // Style common markdown elements
      wrapper.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => {
        const s = (el as HTMLElement).style;
        s.color = "#111";
        s.marginTop = "1.2em";
        s.marginBottom = "0.4em";
      });
      wrapper.querySelectorAll("p").forEach((el) => {
        (el as HTMLElement).style.margin = "0.6em 0";
      });
      wrapper.querySelectorAll("ul,ol").forEach((el) => {
        (el as HTMLElement).style.paddingLeft = "1.5em";
      });
      wrapper.querySelectorAll("code").forEach((el) => {
        const s = (el as HTMLElement).style;
        s.background = "#f3f4f6";
        s.padding = "1px 4px";
        s.borderRadius = "3px";
        s.fontSize = "0.9em";
      });
      wrapper.querySelectorAll("blockquote").forEach((el) => {
        const s = (el as HTMLElement).style;
        s.borderLeft = "3px solid #d1d5db";
        s.paddingLeft = "12px";
        s.color = "#6b7280";
        s.margin = "0.8em 0";
      });
      wrapper.querySelectorAll("table").forEach((el) => {
        const s = (el as HTMLElement).style;
        s.borderCollapse = "collapse";
        s.width = "100%";
        s.margin = "0.8em 0";
      });
      wrapper.querySelectorAll("th,td").forEach((el) => {
        const s = (el as HTMLElement).style;
        s.border = "1px solid #d1d5db";
        s.padding = "6px 10px";
        s.textAlign = "left";
      });
      wrapper.querySelectorAll("th").forEach((el) => {
        (el as HTMLElement).style.background = "#f3f4f6";
      });

      await html2pdf()
        .set({
          margin: [12, 16],
          filename: `${contract.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(wrapper)
        .save();
    } catch (e) {
      console.error("PDF download failed:", e);
    } finally {
      setDownloading(false);
    }
  }

  // Tract AI: background generation + commit
  async function handleTractSubmit(prompt: string) {
    if (!myParticipant || !myHeadCommitId) return;
    const requesterName = user?.email?.split("@")[0] ?? "unknown";
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
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {isViewingHistory
              ? `Viewing: ${activeCommitId?.slice(0, 7)} (not your current version)`
              : `Your version: ${myHeadCommitId?.slice(0, 7) ?? "none"}`}
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
              {/* Adopt bar — shown when viewing a historical commit */}
              {isViewingHistory && (
                <div className="space-y-2 p-3 rounded-lg border border-accent/30 bg-accent/5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Viewing commit <span className="font-mono">{activeCommitId?.slice(0, 7)}</span>
                      {activeCommit?.author?.email
                        ? ` by ${activeCommit.author.email.split("@")[0]}`
                        : " by Tract"}
                    </p>
                    <Button size="sm" onClick={() => handleCheckout(activeCommitId!)}>
                      Adopt this version
                    </Button>
                  </div>
                  <p className="text-sm">{activeCommit?.message}</p>
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
        onSubmit={handleTractSubmit}
      />

      <CommitDetailDialog
        commit={activeCommit ?? null}
        parentCommit={activeParentCommit}
        open={commitDetailOpen}
        onOpenChange={setCommitDetailOpen}
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
