"use client";

import { useState, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MentionInput, MentionTextarea } from "@/components/mention-input";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { DiffViewer } from "@/components/diff-viewer";
import { computeLineDiffs } from "@/lib/diff";
import { displayName, normalizeMarkdown } from "@/lib/utils";

// Count the number of change hunks between two documents (a hunk is a run of
// consecutive changed lines), matching how the diff viewer counts changes.
function countHunks(before: string, after: string): number {
  const { diffs } = computeLineDiffs(before, after);
  let hunks = 0;
  let inHunk = false;
  for (const d of diffs) {
    if (d.type !== "unchanged") {
      if (!inHunk) {
        hunks++;
        inHunk = true;
      }
    } else {
      inHunk = false;
    }
  }
  return hunks;
}

function CompareView({
  contractId,
  participantId,
}: {
  contractId: string;
  participantId: string;
}) {
  const { user } = db.useAuth();
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newCommentContent, setNewCommentContent] = useState("");
  const [replyContents, setReplyContents] = useState<{ [issueId: string]: string }>({});
  const [typingIssues, setTypingIssues] = useState<{ [issueId: string]: boolean }>({});

  async function triggerTractReply(issueId: string, issueTitle: string, currentComment: string, existingComments: any[] = []) {
    setTypingIssues(prev => ({ ...prev, [issueId]: true }));
    try {
      const fullComments = [
        ...existingComments.map((c: any) => ({
          author: c.creator?.email ? displayName(c.creator.email, c.creator.id) : "Tract",
          content: c.content,
          createdAt: c.createdAt,
        })),
        {
          author: displayName(user?.email, user?.id),
          content: currentComment,
          createdAt: Date.now(),
        }
      ];

      const res = await fetch("/api/comment-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId,
          issueTitle,
          contractName: contract?.name ?? "Untitled Contract",
          contractContent: theirHead?.content ?? myHead?.content ?? "",
          comments: fullComments,
          viewingCommitId: theirHead?.id ?? myHead?.id,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to get reply from Tract");
      }
    } catch (err) {
      console.error("Error triggering Tract reply:", err);
    } finally {
      setTypingIssues(prev => ({ ...prev, [issueId]: false }));
    }
  }

  async function handleCreateIssue() {
    if (!user || !newIssueTitle.trim() || !newCommentContent.trim()) return;

    const issueId = id();
    const commentId = id();
    const titleText = newIssueTitle.trim();
    const contentText = newCommentContent.trim();

    const targetCommit = theirHead ?? myHead;

    const txs = [
      db.tx.issues[issueId]
        .update({
          title: titleText,
          createdAt: Date.now(),
          status: "open",
        })
        .link({ contract: contractId })
        .link({ creator: user.id }),
      db.tx.comments[commentId]
        .update({
          content: contentText,
          createdAt: Date.now(),
        })
        .link({ issue: issueId })
        .link({ creator: user.id }),
    ];

    if (targetCommit) {
      txs[0] = db.tx.issues[issueId]
        .update({
          title: titleText,
          createdAt: Date.now(),
          status: "open",
        })
        .link({ contract: contractId })
        .link({ creator: user.id })
        .link({ commit: targetCommit.id });
    }

    await db.transact(txs);
    setNewIssueTitle("");
    setNewCommentContent("");

    if (/\B@\s*tract\b/i.test(contentText)) {
      triggerTractReply(issueId, titleText, contentText, []);
    }
  }

  async function handleReply(issueId: string) {
    if (!user) return;
    const content = (replyContents[issueId] ?? "").trim();
    if (!content) return;

    const commentId = id();
    await db.transact([
      db.tx.comments[commentId]
        .update({
          content,
          createdAt: Date.now(),
        })
        .link({ issue: issueId })
        .link({ creator: user.id }),
    ]);

    setReplyContents({ ...replyContents, [issueId]: "" });

    if (/\B@\s*tract\b/i.test(content)) {
      const activeIssue = contract?.issues?.find((issue: any) => issue.id === issueId);
      const previousComments = activeIssue?.comments ?? [];
      triggerTractReply(issueId, activeIssue?.title ?? "", content, previousComments);
    }
  }

  async function handleToggleIssueStatus(issueId: string, currentStatus: string) {
    const newStatus = currentStatus === "closed" ? "open" : "closed";
    await db.transact([
      db.tx.issues[issueId].update({
        status: newStatus,
      }),
    ]);
  }

  function getTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const { data, isLoading } = db.useQuery({
    contracts: {
      commits: {
        author: {},
        parent: {},
      },
      participants: {
        user: {},
      },
      issues: {
        creator: {},
        commit: {},
        comments: {
          creator: {},
        },
      },
      $: { where: { id: contractId } },
    },
  });

  const contract = data?.contracts?.[0];
  const commits = contract?.commits ?? [];
  const participants = contract?.participants ?? [];
  const mentionSuggestions = useMemo(() => {
    return ["tract", ...participants.map((p: any) => p.email ? displayName(p.email) : "").filter(Boolean)];
  }, [participants]);

  const myParticipant = participants.find(
    (p) => p.user?.id === user?.id
  );
  const theirParticipant = participants.find((p) => p.id === participantId);

  const myHead = commits.find((c) => c.id === myParticipant?.headCommitId);
  const theirHead = commits.find((c) => c.id === theirParticipant?.headCommitId);

  const myTime = myHead?.createdAt ?? 0;
  const theirTime = theirHead?.createdAt ?? 0;
  const isTheirVersionLater = theirTime >= myTime;

  async function handleApprove(
    newContent: string,
    approvedCount: number,
    totalCount: number
  ) {
    if (!user || !myParticipant || !myHead || !theirHead) return;
    setApplying(true);

    const normalizedNewcontent = normalizeMarkdown(newContent);
    const normalizedTheircontent = normalizeMarkdown(theirHead.content);
    const normalizedMycontent = normalizeMarkdown(myHead.content);

    // If the merged content matches our current version exactly, there is nothing to commit.
    if (normalizedNewcontent === normalizedMycontent) {
      setApplying(false);
      router.push(`/app/contract/${contractId}`);
      return;
    }

    // Fast-forward: if the merged content matches their version exactly,
    // just move our head pointer to their commit instead of creating a new one.
    // This ensures both participants end up on the same commit ("in agreement").
    if (normalizedNewcontent === normalizedTheircontent) {
      await db.transact([
        db.tx.participants[myParticipant.id].update({
          headCommitId: theirHead.id,
        }),
      ]);
      setApplying(false);
      router.push(`/app/contract/${contractId}`);
      return;
    }

    // Partial merge.
    const theirName = displayName(theirParticipant?.email, theirParticipant?.user?.id);

    // Squash: if my current head is itself an amendable "accept" commit from this
    // same participant, update it in place instead of stacking another commit.
    // This keeps the history clean (one merged commit) rather than a chain of
    // "Accept 2 changes" → "Accept 4 changes".
    const myHeadIsMine = myHead.author?.id === user.id;
    const myHeadHasChildren = commits.some((c) => c.parent?.id === myHead.id);
    const othersOnMyHead = participants.some(
      (p) => p.id !== myParticipant.id && p.headCommitId === myHead.id,
    );
    const myHeadIsAcceptFromThem = myHead.message?.includes(`changes from ${theirName}`) ?? false;
    const squashBaseId = myHead.parent?.id;
    const squashBase = squashBaseId
      ? commits.find((c) => c.id === squashBaseId)
      : undefined;
    const canSquash =
      myHeadIsMine &&
      !myHeadHasChildren &&
      !othersOnMyHead &&
      myHeadIsAcceptFromThem &&
      squashBase?.content !== undefined;

    if (canSquash && squashBase) {
      // Recompute counts against the pre-squash baseline so the cumulative
      // number of accepted/available changes is accurate.
      const baseContent = normalizeMarkdown(squashBase.content);
      const cumulativeApproved = countHunks(baseContent, normalizedNewcontent);
      const cumulativeTotal = countHunks(baseContent, normalizedTheircontent);
      const message = `Accept ${cumulativeApproved}/${cumulativeTotal} changes from ${theirName}`;

      await db.transact([
        db.tx.commits[myHead.id].update({
          content: normalizedNewcontent,
          message,
          // eslint-disable-next-line react-hooks/purity
          createdAt: Date.now(),
        }),
      ]);
    } else {
      const message = `Accept ${approvedCount}/${totalCount} changes from ${theirName}`;
      const newCommitId = id();
      await db.transact([
        db.tx.commits[newCommitId]
          .update({
            content: normalizedNewcontent,
            message,
            // eslint-disable-next-line react-hooks/purity
            createdAt: Date.now(),
          })
          .link({ contract: contractId })
          .link({ author: user.id })
          .link({ parent: myHead.id }),
        db.tx.participants[myParticipant.id].update({
          headCommitId: newCommitId,
        }),
      ]);
    }

    setApplying(false);
    if (approvedCount >= totalCount) {
      router.push(`/app/contract/${contractId}`);
    }
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (!contract) {
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

  if (!myParticipant || !theirParticipant) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Participant not found.</p>
        <Button variant="outline" onClick={() => router.push(`/app/contract/${contractId}`)}>
          Back to contract
        </Button>
      </div>
    );
  }

  if (!myHead || !theirHead) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Missing commit data. One or both participants have no commits.
        </p>
        <Button variant="outline" onClick={() => router.push(`/app/contract/${contractId}`)}>
          Back to contract
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground -ml-2 mb-2"
            onClick={() => router.push(`/app/contract/${contractId}`)}
          >
            &larr; Back to {contract.name}
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Compare changes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your version vs. <span title={theirParticipant.email || undefined}>{displayName(theirParticipant.email, theirParticipant.user?.id)}</span>&apos;s version
          </p>
        </div>
      </div>

      {/* Version info */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left Card: Your version */}
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-xs text-muted-foreground">
            Your version {isTheirVersionLater ? "(earlier)" : "(later)"}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono">{myHead.id.slice(0, 7)}</span>
            <span className="text-muted-foreground/30 text-[10px]">&bull;</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(myHead.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{myHead.message}</div>
        </div>

        {/* Right Card: Their version */}
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-xs text-muted-foreground">
            <span title={theirParticipant.email || undefined}>
              {displayName(theirParticipant.email, theirParticipant.user?.id)}
            </span>&apos;s version {isTheirVersionLater ? "(later)" : "(earlier)"}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono">{theirHead.id.slice(0, 7)}</span>
            <span className="text-muted-foreground/30 text-[10px]">&bull;</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(theirHead.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{theirHead.message}</div>
        </div>
      </div>

      {/* Diff viewer */}
      <DiffViewer
        key={`${myHead.id}-${theirHead.id}`}
        myContent={myHead.content}
        theirContent={theirHead.content}
        theirEmail={displayName(theirParticipant.email, theirParticipant.user?.id)}
        onApprove={handleApprove}
        applying={applying}
        contractId={contractId}
        commitId={theirHead.id}
        issues={contract?.issues ?? []}
        onToggleIssueStatus={handleToggleIssueStatus}
      />

      {/* Version Discussions / Issues on these versions */}
      <div className="p-6 rounded-lg border border-border bg-card space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Version Discussions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create feedback or discuss changes in this version comparison. Leave general comments or specify issues.
          </p>
        </div>

        {/* Create new issue / comment thread */}
        <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/40">
          <h3 className="text-sm font-medium">Start a new discussion thread / issue</h3>
          <div className="space-y-3">
            <Input
              placeholder="Topic or issue title (e.g., 'Clarify section 3 payment terms')"
              value={newIssueTitle}
              onChange={(e) => setNewIssueTitle(e.target.value)}
              className="text-sm"
            />
             <MentionTextarea
              placeholder="Write your feedback or comment here..."
              value={newCommentContent}
              onChange={setNewCommentContent}
              suggestions={mentionSuggestions}
              className="w-full min-h-[80px] text-sm p-3 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring bg-card"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setNewIssueTitle("");
                  setNewCommentContent("");
                }}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handleCreateIssue}
                disabled={!newIssueTitle.trim() || !newCommentContent.trim() || !user}
              >
                Create discussion
              </Button>
            </div>
          </div>
        </div>

        {/* Existing Discussion Threads */}
        <div className="space-y-4">
          {(() => {
            const contractIssues = contract?.issues ?? [];
            const relevantIssues = contractIssues.filter(
              (issue: any) =>
                (!issue.commit ||
                issue.commit.id === myHead?.id ||
                issue.commit.id === theirHead?.id) &&
                (issue.lineNumber === undefined || issue.lineNumber === null)
            );
            const sortedIssues = [...relevantIssues].sort((a: any, b: any) => b.createdAt - a.createdAt);

            return (
              <>
                <h3 className="text-sm font-semibold">Active threads on these versions ({sortedIssues.length})</h3>
                {sortedIssues.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No discussion threads found for these versions yet.</p>
                ) : (
                  <div className="space-y-4">
                    {sortedIssues.map((issue: any) => {
                      const comments = [...(issue.comments ?? [])].sort((a: any, b: any) => a.createdAt - b.createdAt);
                      const isClosed = issue.status === "closed";
                      const issueId = issue.id;
                      const creatorEmail = issue.creator?.email ? displayName(issue.creator.email) : "Unknown user";

                      return (
                        <div key={issue.id} className="p-4 rounded-lg border border-border bg-background space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                isClosed ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                              }`}>
                                {isClosed ? "Closed" : "Active"}
                              </span>
                              <h4 className="font-medium text-sm" dir="auto">{issue.title}</h4>
                              {issue.commit && (
                                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  Version: {issue.commit.id.slice(0, 7)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground">
                                Started by {creatorEmail} &middot; {new Date(issue.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                              {user && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-[10px] h-7 px-2 hover:bg-accent"
                                  onClick={() => handleToggleIssueStatus(issue.id, issue.status)}
                                >
                                  {isClosed ? "Reopen" : "Close"}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Comments Stream (linear comment correspondence) */}
                          <div className="pl-4 border-l border-border/80 space-y-3">
                            {comments.map((comment: any) => {
                              const isTract = !comment.creator;
                              const commenterEmail = !isTract
                                ? (comment.creator?.email ? displayName(comment.creator.email) : "Unknown user")
                                : "Tract";
                              return (
                                <div key={comment.id} className="text-xs space-y-1">
                                  <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                                    {isTract && (
                                      <span
                                        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-bold shadow-sm"
                                        style={{
                                          background:
                                            "linear-gradient(135deg, var(--color-accent), color-mix(in oklch, var(--color-accent) 60%, #6d9eeb))",
                                          color: "white",
                                        }}
                                      >
                                        T
                                      </span>
                                    )}
                                    <span className={`font-semibold ${isTract ? "text-accent" : "text-foreground"}`}>
                                      {commenterEmail}
                                    </span>
                                    <span>&middot;</span>
                                    <span>{getTimeAgo(comment.createdAt)}</span>
                                  </div>
                                  <p className="text-foreground/90 whitespace-pre-wrap" dir="auto">{comment.content}</p>
                                </div>
                              );
                            })}
                            {typingIssues[issueId] && (
                              <div className="text-xs space-y-1 animate-pulse flex items-center gap-2 text-muted-foreground font-mono">
                                <span
                                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-bold"
                                  style={{
                                    background:
                                      "linear-gradient(135deg, var(--color-accent), color-mix(in oklch, var(--color-accent) 60%, #6d9eeb))",
                                    color: "white",
                                  }}
                                >
                                  T
                                </span>
                                <span className="font-semibold text-accent">Tract</span>
                                <span>is typing...</span>
                              </div>
                            )}
                          </div>

                          {/* Quick Reply Form */}
                          {!isClosed && user && (
                            <div className="flex items-center gap-2 pt-2">
                              <MentionInput
                                placeholder="Reply to this thread..."
                                value={replyContents[issueId] ?? ""}
                                onChange={(val) => setReplyContents({ ...replyContents, [issueId]: val })}
                                suggestions={mentionSuggestions}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && (replyContents[issueId] ?? "").trim()) {
                                    handleReply(issueId);
                                  }
                                }}
                                className="text-xs h-8"
                              />
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleReply(issueId)}
                                disabled={!(replyContents[issueId] ?? "").trim()}
                              >
                                Reply
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default function ComparePage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id: contractId, pid: participantId } = use(params);

  return (
    <AuthGate>
      <AppShell>
        <CompareView contractId={contractId} participantId={participantId} />
      </AppShell>
    </AuthGate>
  );
}
