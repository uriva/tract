"use client";

import { useState, useMemo } from "react";
import { computeLineDiffs, applySelectedChanges, pairWordDiffs, LineDiff, type WordSegment } from "@/lib/diff";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MentionInput, MentionTextarea } from "@/components/mention-input";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { displayName } from "@/lib/utils";

interface DiffViewerProps {
  myContent: string;
  theirContent: string;
  theirEmail: string;
  onApprove?: (newContent: string, approvedCount: number, totalCount: number) => void;
  applying?: boolean;
  contractId: string;
  commitId?: string;
  issues?: any[];
  onToggleIssueStatus?: (issueId: string, currentStatus: string) => Promise<void>;
  commits?: any[];
  myParticipant?: any;
  contractName?: string;
  onCommentClick?: (issueId: string, commentId: string) => void;
}

function getLineIssues(diff: LineDiff, issues: any[], commitId?: string) {
  return issues.filter((issue) => {
    if (issue.lineNumber === undefined) return false;

    // If the issue is linked to a commit, only render it on the side it belongs to
    if (issue.commit?.id) {
      const isTheirCommit = commitId && issue.commit.id === commitId;

      if (isTheirCommit) {
        // This issue belongs to theirContent (the right side / Nizzan's version).
        // So we only render it on lines that are part of theirContent ("added" or "unchanged").
        const isTheirLine = diff.type === "added" || diff.type === "unchanged";
        if (isTheirLine && diff.lineNumber === issue.lineNumber) {
          return true;
        }
      } else {
        // This issue belongs to myContent (the left side / our own version).
        // So we only render it on lines that are part of myContent ("removed" or "unchanged").
        const isMyLine = diff.type === "removed" || diff.type === "unchanged";
        const myLineNumber = diff.type === "removed" ? diff.lineNumber : diff.originalLineNumber;
        if (isMyLine && myLineNumber === issue.lineNumber) {
          return true;
        }
      }
      return false;
    }

    // Fallback for legacy issues with no commit ID (strict match on line number and type)
    if (issue.lineNumber === diff.lineNumber && issue.lineType === diff.type) {
      return true;
    }

    return false;
  });
}

export function DiffViewer({
  myContent,
  theirContent,
  theirEmail,
  onApprove,
  applying,
  contractId,
  commitId,
  issues = [],
  onToggleIssueStatus,
  commits = [],
  myParticipant,
  contractName = "",
  onCommentClick,
}: DiffViewerProps) {
  const { user } = db.useAuth();
  const { data: contractData } = db.useQuery({
    contracts: {
      participants: {
        user: {}
      },
      $: { where: { id: contractId } }
    }
  });
  const participants = contractData?.contracts?.[0]?.participants ?? [];
  const mentionSuggestions = useMemo(() => {
    const list = ["tract"];
    participants.forEach((p: any) => {
      if (p.email) {
        list.push(p.email.split("@")[0]);
      }
    });
    if (theirEmail) {
      list.push(theirEmail.split("@")[0]);
    }
    return Array.from(new Set(list));
  }, [participants, theirEmail]);

  const [commentReplyContents, setCommentReplyContents] = useState<{ [issueId: string]: string }>({});
  const [activeCommentLine, setActiveCommentLine] = useState<{ lineNumber: number; lineType: string } | null>(null);
  const [newCommentInput, setNewCommentInput] = useState("");
  const [typingIssues, setTypingIssues] = useState<{ [issueId: string]: boolean }>({});
  const [manualText, setManualText] = useState("");
  const [isEditingManually, setIsEditingManually] = useState(false);
  const [copiedMerged, setCopiedMerged] = useState(false);

  async function triggerTractReply(issueId: string, issueTitle: string, currentComment: string, existingComments: any[] = []) {
    setTypingIssues(prev => ({ ...prev, [issueId]: true }));
    try {
      const fullComments = [
        ...existingComments.map((c: any) => ({
          author: c.creator?.email ? displayName(c.creator.email) : "Tract",
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
          contractName: contractData?.contracts?.[0]?.name ?? "Untitled Contract",
          contractContent: theirContent || myContent || "",
          comments: fullComments,
          viewingCommitId: commitId,
          userId: user?.id,
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

  async function handleCreateInlineComment(lineNumber: number, lineType: string, content: string) {
    if (!user || !contractId || !content.trim()) return;

    const issueId = id();
    const commentId = id();

    const txs = [
      db.tx.issues[issueId]
        .update({
          title: `Line ${lineNumber} (${lineType}) Discussion`,
          createdAt: Date.now(),
          status: "open",
          lineNumber,
          lineType,
        })
        .link({ contract: contractId })
        .link({ creator: user.id }),
      db.tx.comments[commentId]
        .update({
          content: content.trim(),
          createdAt: Date.now(),
        })
        .link({ issue: issueId })
        .link({ creator: user.id }),
    ];

    if (commitId) {
      txs[0] = db.tx.issues[issueId]
        .update({
          title: `Line ${lineNumber} (${lineType}) Discussion`,
          createdAt: Date.now(),
          status: "open",
          lineNumber,
          lineType,
        })
        .link({ contract: contractId })
        .link({ creator: user.id })
        .link({ commit: commitId });
    }

    await db.transact(txs);
    setNewCommentInput("");
    setActiveCommentLine(null);

    if (/\B@\s*tract\b/i.test(content)) {
      triggerTractReply(issueId, `Line ${lineNumber} (${lineType}) Discussion`, content, []);
    }
  }

  async function handleReplyInlineComment(issueId: string, content: string) {
    if (!user || !content.trim()) return;

    const commentId = id();
    await db.transact([
      db.tx.comments[commentId]
        .update({
          content: content.trim(),
          createdAt: Date.now(),
        })
        .link({ issue: issueId })
        .link({ creator: user.id }),
    ]);

    setCommentReplyContents({ ...commentReplyContents, [issueId]: "" });

    if (/\B@\s*tract\b/i.test(content)) {
      const activeIssue = issues.find((issue: any) => issue.id === issueId);
      const previousComments = activeIssue?.comments ?? [];
      triggerTractReply(issueId, activeIssue?.title ?? "Inline Discussion", content, previousComments);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    await db.transact([
      db.tx.comments[commentId].delete()
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

  const { diffs, hasChanges } = useMemo(
    () => computeLineDiffs(myContent, theirContent),
    [myContent, theirContent]
  );

  const wordSegments = useMemo(() => pairWordDiffs(diffs), [diffs]);

  const changedIndices = useMemo(
    () =>
      diffs.reduce<number[]>((acc, d, i) => {
        if (d.type !== "unchanged") acc.push(i);
        return acc;
      }, []),
    [diffs]
  );

  const hunkInfo = useMemo(() => {
    const hunkStart = new Map<number, number>();
    const hunkEnd = new Map<number, number>();
    const isFirstInHunk = new Set<number>();

    let currentStart = -1;
    for (let i = 0; i < diffs.length; i++) {
      if (diffs[i].type !== "unchanged") {
        if (currentStart === -1) {
          currentStart = i;
          isFirstInHunk.add(i);
        }
        hunkStart.set(i, currentStart);
      } else {
        if (currentStart !== -1) {
          for (let k = currentStart; k < i; k++) {
            hunkEnd.set(k, i - 1);
          }
          currentStart = -1;
        }
      }
    }
    if (currentStart !== -1) {
      for (let k = currentStart; k < diffs.length; k++) {
        hunkEnd.set(k, diffs.length - 1);
      }
    }

    return { hunkStart, hunkEnd, isFirstInHunk };
  }, [diffs]);

  const [approved, setApproved] = useState<Set<number>>(new Set());

  const totalHunkCount = hunkInfo.isFirstInHunk.size;

  const approvedHunkCount = useMemo(() => {
    let count = 0;
    for (const startIndex of hunkInfo.isFirstInHunk) {
      if (approved.has(startIndex)) {
        count++;
      }
    }
    return count;
  }, [approved, hunkInfo.isFirstInHunk]);

  function toggleHunk(index: number) {
    const start = hunkInfo.hunkStart.get(index);
    const end = hunkInfo.hunkEnd.get(index);
    if (start === undefined || end === undefined) return;

    setApproved((prev) => {
      const next = new Set(prev);
      let allApproved = true;
      for (let k = start; k <= end; k++) {
        if (!next.has(k)) {
          allApproved = false;
          break;
        }
      }

      if (allApproved) {
        for (let k = start; k <= end; k++) {
          next.delete(k);
        }
      } else {
        for (let k = start; k <= end; k++) {
          next.add(k);
        }
      }
      return next;
    });
  }

  function selectAll() {
    setApproved(new Set(changedIndices));
  }

  function selectNone() {
    setApproved(new Set());
  }

  const previewContent = useMemo(() => applySelectedChanges(myContent, theirContent, approved), [myContent, theirContent, approved]);

  function handleApply() {
    if (!onApprove) return;
    const newContent = isEditingManually ? manualText : previewContent;
    onApprove(newContent, approvedHunkCount, totalHunkCount);
  }

  if (!hasChanges && onApprove) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No differences. You and {theirEmail} are in sync.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      {onApprove ? (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {totalHunkCount} change{totalHunkCount !== 1 ? "s" : ""} &middot;{" "}
              {approvedHunkCount} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={selectAll}
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={selectNone}
            >
              Clear
            </Button>
          </div>

          <Button
            size="sm"
            onClick={handleApply}
            disabled={(!isEditingManually && approvedHunkCount === 0) || applying}
          >
            {applying
              ? "Applying..."
              : isEditingManually
              ? "Apply manual merge"
              : `Apply ${approvedHunkCount} change${approvedHunkCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      ) : (
        totalHunkCount > 0 && (
          <div className="py-1 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {totalHunkCount} change{totalHunkCount !== 1 ? "s" : ""}
            </span>
          </div>
        )
      )}

      {/* Diff lines */}
      <div className="rounded-lg border border-border">
        <div className="font-mono text-sm">
          {diffs.map((diff, i) => (
            <DiffLine
              key={i}
              diff={diff}
              index={i}
              isApproved={approved.has(i)}
              onToggle={toggleHunk}
              wordSegments={wordSegments.get(i)}
              isFirstInHunk={hunkInfo.isFirstInHunk.has(i)}
              lineIssues={getLineIssues(diff, issues, commitId)}
              user={user}
              activeCommentLine={activeCommentLine}
              setActiveCommentLine={setActiveCommentLine}
              newCommentInput={newCommentInput}
              setNewCommentInput={setNewCommentInput}
              commentReplyContents={commentReplyContents}
              setCommentReplyContents={setCommentReplyContents}
              onCreateComment={handleCreateInlineComment}
              onReplyComment={handleReplyInlineComment}
              getTimeAgo={getTimeAgo}
              readOnly={!onApprove}
              onToggleIssueStatus={onToggleIssueStatus}
              mentionSuggestions={mentionSuggestions}
              typingIssues={typingIssues}
              onDeleteComment={handleDeleteComment}
              onCommentClick={onCommentClick}
            />
          ))}
        </div>
      </div>

      {/* Merged Preview and Manual Merge Option */}
      {onApprove && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Merged Output Preview</span>
              <Badge variant="outline" className="text-[10px] h-5 py-0">
                {isEditingManually ? "Manual edits enabled" : "Auto-computed"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] h-7 px-2.5"
                onClick={() => {
                  navigator.clipboard.writeText(isEditingManually ? manualText : previewContent);
                  setCopiedMerged(true);
                  setTimeout(() => setCopiedMerged(false), 2000);
                }}
              >
                {copiedMerged ? "Copied!" : "Copy to clipboard"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] h-7 text-accent hover:bg-accent/10"
                onClick={() => {
                  if (isEditingManually) {
                    setIsEditingManually(false);
                  } else {
                    setManualText(previewContent);
                    setIsEditingManually(true);
                  }
                }}
              >
                {isEditingManually ? "Reset to checkboxes" : "Edit manually"}
              </Button>
            </div>
          </div>

          <Textarea
            value={isEditingManually ? manualText : previewContent}
            onChange={(e) => {
              if (!isEditingManually) {
                setManualText(previewContent);
                setIsEditingManually(true);
              }
              setManualText(e.target.value);
            }}
            placeholder="No changes selected yet. Select some changes above or type here to compose your manual merge."
            className="font-mono text-xs min-h-[150px] max-h-[400px] bg-background resize-y leading-relaxed"
          />

          {isEditingManually && (
            <p className="text-[10px] text-muted-foreground italic">
              You are editing the merged result manually. Click "Apply manual merge" to save this exact text.
            </p>
          )}

          <div className="flex justify-end pt-2 border-t border-border/50">
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!(isEditingManually ? manualText : previewContent).trim() || applying}
            >
              {applying ? "Applying..." : isEditingManually ? "Apply manual merge" : "Apply merged changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface DiffLineProps {
  diff: LineDiff;
  index: number;
  isApproved: boolean;
  onToggle: (index: number) => void;
  wordSegments?: WordSegment[];
  isFirstInHunk: boolean;
  lineIssues: any[];
  user: any;
  activeCommentLine: { lineNumber: number; lineType: string } | null;
  setActiveCommentLine: (val: { lineNumber: number; lineType: string } | null) => void;
  newCommentInput: string;
  setNewCommentInput: (val: string) => void;
  commentReplyContents: { [key: string]: string };
  setCommentReplyContents: (val: { [key: string]: string }) => void;
  onCreateComment: (lineNumber: number, lineType: string, content: string) => Promise<void>;
  onReplyComment: (issueId: string, content: string) => Promise<void>;
  getTimeAgo: (timestamp: number) => string;
  readOnly?: boolean;
  onToggleIssueStatus?: (issueId: string, currentStatus: string) => Promise<void>;
  mentionSuggestions: string[];
  typingIssues: { [issueId: string]: boolean };
  onDeleteComment: (commentId: string) => Promise<void>;
  onCommentClick?: (issueId: string, commentId: string) => void;
}

function DiffLine({
  diff,
  index,
  isApproved,
  onToggle,
  wordSegments,
  isFirstInHunk,
  lineIssues,
  user,
  activeCommentLine,
  setActiveCommentLine,
  newCommentInput,
  setNewCommentInput,
  commentReplyContents,
  setCommentReplyContents,
  onCreateComment,
  onReplyComment,
  getTimeAgo,
  readOnly = false,
  onToggleIssueStatus,
  mentionSuggestions,
  typingIssues,
  onDeleteComment,
  onCommentClick,
}: DiffLineProps) {
  const isUnchanged = diff.type === "unchanged";
  const isAdded = diff.type === "added";
  const isPaired = !isUnchanged && !!wordSegments;

  const showCommentForm = activeCommentLine?.lineNumber === diff.lineNumber && activeCommentLine?.lineType === diff.type;
  const showCommentsSection = lineIssues.length > 0 || showCommentForm;

  return (
    <div className="flex flex-col border-b border-border/40 last:border-0 hover:bg-muted/10 group/row">
      {/* Code line row */}
      <div
        className={`flex items-stretch text-xs leading-6 relative ${
          isUnchanged ? "" : isAdded ? "diff-line-added" : "diff-line-removed"
        }`}
      >
        {/* Checkbox column */}
        {!readOnly && (
          <div className="w-8 shrink-0 flex items-center justify-center relative">
            {isFirstInHunk && !isUnchanged && (
              <Checkbox
                checked={isApproved}
                onCheckedChange={() => onToggle(index)}
                className="h-3.5 w-3.5 z-10"
              />
            )}
          </div>
        )}

        {/* Comment button column */}
        <div className="w-6 shrink-0 flex items-center justify-center relative">
          {user && (
            <button
              onClick={() => {
                if (showCommentForm) {
                  setActiveCommentLine(null);
                } else {
                  setActiveCommentLine({ lineNumber: diff.lineNumber, lineType: diff.type });
                  setNewCommentInput("");
                }
              }}
              className={`p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all z-10 ${
                showCommentForm
                  ? "opacity-100 bg-accent text-foreground"
                  : "opacity-0 group-hover/row:opacity-100"
              }`}
              title="Comment on this line"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
        </div>

        {/* Line number column */}
        <div className="w-12 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">
          {diff.lineNumber}
        </div>

        {/* Action (+/-) column */}
        {!isUnchanged && (
          <div className="w-5 shrink-0 text-center select-none font-semibold">
            <span className={isAdded ? "text-diff-added-fg" : "text-diff-removed-fg"}>
              {diff.value.trim() === "" ? "" : (isAdded ? "+" : "-")}
            </span>
          </div>
        )}

        {/* Unchanged Action empty space */}
        {isUnchanged && <div className="w-5 shrink-0" />}

        {/* Text column */}
        <div
          className={`flex-1 px-3 whitespace-pre-wrap break-all ${
            isUnchanged
              ? ""
              : isAdded
                ? isPaired ? "diff-text-added-paired" : "diff-text-added"
                : isPaired ? "diff-text-removed-paired" : "diff-text-removed"
          }`}
          dir="auto"
        >
          {isPaired && wordSegments ? (
            wordSegments.map((seg, i) =>
              seg.type === "changed" ? (
                <span key={i} className="diff-word-changed">
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )
          ) : (
            diff.value || "\u00A0"
          )}
        </div>
      </div>

      {/* Inline Comments Section */}
      {showCommentsSection && (
        <div className="bg-muted/30 border-l-4 border-accent/40 pl-8 pr-4 py-2 space-y-3 text-xs font-sans">
          {/* Thread list */}
          {lineIssues.map((issue) => {
            const comments = [...(issue.comments ?? [])].sort((a: any, b: any) => a.createdAt - b.createdAt);
            const isClosed = issue.status === "closed";
            const replyKey = issue.id;

            return (
              <div key={issue.id} className="p-3 rounded-lg border border-border bg-background space-y-2 max-w-2xl">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/40 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium ${
                      isClosed ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                    }`}>
                      {isClosed ? "Closed" : "Active"}
                    </span>
                    <span className="font-semibold text-foreground">
                      Inline Discussion
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {onToggleIssueStatus && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[9px] px-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => onToggleIssueStatus(issue.id, issue.status)}
                      >
                        {isClosed ? "Reopen" : "Close"}
                      </Button>
                    )}
                    <span>{new Date(issue.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                </div>

                {/* Comment list */}
                <div className="space-y-2">
                  {comments.map((comment: any) => {
                    const isTract = !comment.creator;
                    const authorName = !isTract
                      ? (comment.creator?.email ? displayName(comment.creator.email) : "Unknown user")
                      : "Tract";
                    return (
                      <div
                        key={comment.id}
                        id={`comment-${comment.id}`}
                        onClick={() => onCommentClick?.(issue.id, comment.id)}
                        className={`group/comment space-y-0.5 p-1 rounded transition-all ${
                          onCommentClick ? "cursor-pointer hover:bg-muted/40" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between text-muted-foreground">
                          <div className="flex items-center gap-1 text-[10px]">
                            {isTract && (
                              <span
                                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-bold shadow-sm mr-0.5"
                                style={{
                                  background:
                                    "linear-gradient(135deg, var(--color-accent), color-mix(in oklch, var(--color-accent) 60%, #6d9eeb))",
                                  color: "white",
                                }}
                              >
                                T
                              </span>
                            )}
                            <span className={`font-semibold ${isTract ? "text-accent" : "text-foreground/80"}`}>{authorName}</span>
                            <span>&middot;</span>
                            <span>{getTimeAgo(comment.createdAt)}</span>
                          </div>
                          {comment.creator?.id === user?.id && (
                            <button
                              onClick={() => onDeleteComment(comment.id)}
                              className="opacity-0 group-hover/comment:opacity-100 transition-opacity text-[9px] text-muted-foreground hover:text-destructive cursor-pointer"
                              title="Delete comment"
                            >
                              delete
                            </button>
                          )}
                        </div>
                        <p className="text-foreground/90 whitespace-pre-wrap pl-1" dir="auto">{comment.content}</p>
                      </div>
                    );
                  })}
                  {typingIssues[issue.id] && (
                    <div className="text-[10px] space-y-1 animate-pulse flex items-center gap-1.5 text-muted-foreground font-sans pt-1 border-t border-border/10">
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded bg-gradient-to-br from-accent to-[#6d9eeb] text-[8px] font-bold text-white shadow-sm shrink-0">
                        T
                      </span>
                      <span className="font-semibold text-accent">Tract</span>
                      <span>is typing...</span>
                    </div>
                  )}
                </div>

                {/* Reply Form */}
                {!isClosed && user && (
                  <div className="flex items-center gap-2 pt-1.5 border-t border-border/30">
                    <MentionInput
                      placeholder="Reply inline..."
                      value={commentReplyContents[replyKey] ?? ""}
                      onChange={(val) => setCommentReplyContents({ ...commentReplyContents, [replyKey]: val })}
                      suggestions={mentionSuggestions}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (commentReplyContents[replyKey] ?? "").trim()) {
                          onReplyComment(replyKey, commentReplyContents[replyKey]);
                        }
                      }}
                      className="text-[11px] h-7 bg-muted/20"
                    />
                    <Button
                      size="sm"
                      className="h-7 text-[10px] px-2"
                      onClick={() => onReplyComment(replyKey, commentReplyContents[replyKey])}
                      disabled={!(commentReplyContents[replyKey] ?? "").trim()}
                    >
                      Reply
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {/* New inline comment input form */}
          {showCommentForm && (
            <div className="p-3 rounded-lg border border-border bg-background space-y-2 max-w-2xl">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
                New inline comment on line {diff.lineNumber}
              </span>
              <MentionTextarea
                placeholder="Write your inline comment/feedback here..."
                value={newCommentInput}
                onChange={setNewCommentInput}
                suggestions={mentionSuggestions}
                className="min-h-[60px] text-xs"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px]"
                  onClick={() => setActiveCommentLine(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => onCreateComment(diff.lineNumber, diff.type, newCommentInput)}
                  disabled={!newCommentInput.trim()}
                >
                  Post comment
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
