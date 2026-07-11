"use client";

import { useState, useCallback, useMemo, useRef, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MentionTextarea } from "@/components/mention-input";
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
import { DiffViewer } from "@/components/diff-viewer";
import { CommitDetailDialog } from "@/components/commit-detail-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SignDialog } from "@/components/sign-dialog";
import { displayName, assignParticipantColors, normalizeMarkdown, isGuestUser, isInviteTemplateParticipant } from "@/lib/utils";
import { visibleCommits } from "@/lib/commit-layout";
import { toast } from "sonner";
import { LinkifiedText } from "@/components/linkified-text";

const SUMMARY_TRUNCATE = 180;

function CollapsibleSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > SUMMARY_TRUNCATE;
  const displayed = !needsTruncation || expanded ? text : text.slice(0, SUMMARY_TRUNCATE).trimEnd() + "…";

  return (
    <div className="text-xs text-muted-foreground px-1">
      <p>
        {displayed}
        {needsTruncation && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1 text-foreground/60 hover:text-foreground underline underline-offset-2 cursor-pointer"
          >
            {expanded ? "show less" : "show more"}
          </button>
        )}
      </p>
    </div>
  );
}

type Mode = "view" | "edit";

function ContractEditor({ contractId }: { contractId: string }) {
  const { user } = db.useAuth();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tractOpen, setTractOpen] = useState(false);
  const [commitDetailOpen, setCommitDetailOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [versionSignOpen, setVersionSignOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [copied, setCopied] = useState(false);
  const [viewingCommitId, setViewingCommitId] = useState<string | null>(null);
  const [tractStatus, setTractStatus] = useState<
    | { state: "working"; prompt: string }
    | { state: "done"; prompt: string }
    | { state: "error"; prompt: string; error: string }
    | null
  >(null);

  const [activeTab, setActiveTab] = useState<"document" | "issues" | "pull-requests" | "history">("document");
  const [activePullRequestId, setActivePullRequestId] = useState<string | null>(null);
  const [prArchivedExpanded, setPrArchivedExpanded] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newCommentContent, setNewCommentContent] = useState("");
  const [replyContents, setReplyContents] = useState<{ [issueId: string]: string }>({});
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<"active" | "closed">("active");
  const [typingIssues, setTypingIssues] = useState<{ [issueId: string]: boolean }>({});

  const navigateTo = useCallback((
    tab: "document" | "issues" | "pull-requests" | "history",
    issueId: string | null = null,
    prId: string | null = null,
    commentId: string | null = null,
    replace: boolean = false
  ) => {
    const params = new URLSearchParams(window.location.search);
    
    if (tab === "document") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    if (issueId) {
      params.set("issue", issueId);
    } else {
      params.delete("issue");
    }

    if (prId) {
      params.set("pr", prId);
    } else {
      params.delete("pr");
    }

    if (commentId) {
      params.set("comment", commentId);
    } else {
      params.delete("comment");
    }

    const search = params.toString();
    const newUrl = `${window.location.pathname}${search ? "?" + search : ""}${window.location.hash}`;
    
    if (replace) {
      window.history.replaceState(null, "", newUrl);
    } else {
      window.history.pushState(null, "", newUrl);
    }

    setActiveTab(tab);
    setSelectedIssueId(issueId);
    setActivePullRequestId(prId);
  }, []);

  // Synchronize state with URL parameters (for history back/forward and direct links)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab") as "document" | "issues" | "pull-requests" | "history" | null;
      const issueId = params.get("issue");
      const prId = params.get("pr");

      if (tab) {
        setActiveTab(tab);
      } else {
        setActiveTab("document");
      }

      setSelectedIssueId(issueId);
      setActivePullRequestId(prId);
    };

    window.addEventListener("popstate", handlePopState);
    // Initialize state on mount
    handlePopState();

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

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
          contractContent: activeCommit?.content ?? "",
          comments: fullComments,
          viewingCommitId: activeCommitId,
          userId: user?.id,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to get reply from Tract");
      }
      toast.success("Sent to Tract", {
        description: "Tract is on it — its reply will appear here shortly.",
      });
    } catch (err) {
      console.error("Error triggering Tract reply:", err);
      toast.error("Couldn't reach Tract", {
        description: "Your comment was posted, but Tract wasn't notified. Try mentioning it again.",
      });
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

    if (activeCommitId) {
      txs[0] = db.tx.issues[issueId]
        .update({
          title: titleText,
          createdAt: Date.now(),
          status: "open",
        })
        .link({ contract: contractId })
        .link({ creator: user.id })
        .link({ commit: activeCommitId });
    }

    await db.transact(txs);
    setNewIssueTitle("");
    setNewCommentContent("");
    navigateTo("issues", issueId);

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
      issues: {
        creator: {},
        commit: {},
        comments: {
          creator: {},
        },
      },
      pullRequests: {
        sourceCommit: {
          author: {},
        },
        targetParticipant: {
          user: {},
        },
        requester: {},
      },
      signatures: {
        creator: {},
        commit: {},
      },
      $: { where: { id: contractId } },
    },
  });

  const contract = data?.contracts?.[0];
  const commits = contract?.commits ?? [];
  // Real participants only. Invite-link template records (no user, no email)
  // are placeholders for the invite itself and must never be treated as a
  // person, approver, or version.
  const participants = (contract?.participants ?? []).filter(
    (p: any) => !isInviteTemplateParticipant(p),
  );
  const isGuest = isGuestUser(user);
  const colorMap = useMemo(() => assignParticipantColors(participants), [participants]);
  const mentionSuggestions = useMemo(() => {
    return ["tract", ...participants.map((p: any) => p.email ? displayName(p.email) : "").filter(Boolean)];
  }, [participants]);

  const myParticipant = participants.find(
    (p) => p.user?.id === user?.id
  );
  const isOwner = contract?.owner?.id === user?.id;
  const myHeadCommitId = myParticipant?.headCommitId;
  const headCommit = commits.find((c) => c.id === myHeadCommitId);

  // Which commit are we currently looking at?
  const activeCommitId = viewingCommitId ?? myHeadCommitId;
  const activeCommit = commits.find((c) => c.id === activeCommitId);
  const activeParentCommit = activeCommit?.parent?.id
    ? commits.find((c) => c.id === activeCommit.parent!.id) ?? null
    : null;
  const isViewingHistory = viewingCommitId !== null && viewingCommitId !== myHeadCommitId;

  const activeCommitSignatures = useMemo(() => {
    if (!activeCommitId) return [];
    return (contract?.signatures ?? []).filter(
      (sig: any) => sig.commit?.id === activeCommitId
    );
  }, [contract?.signatures, activeCommitId]);

  const hasMySignatureOnActiveCommit = useMemo(() => {
    return activeCommitSignatures.some((sig: any) => sig.creator?.id === user?.id);
  }, [activeCommitSignatures, user?.id]);

  // Build set of commits that have children (used for delete eligibility)
  const commitsWithChildren = useMemo(() => {
    const s = new Set<string>();
    for (const c of commits) {
      if (c.parent?.id) s.add(c.parent.id);
    }
    return s;
  }, [commits]);

  // Build set of deletable commit IDs
  const deletableCommitIds = useMemo(() => {
    const s = new Set<string>();
    if (!user) return s;
    for (const c of commits) {
      // Must be a leaf (no children)
      if (commitsWithChildren.has(c.id)) continue;
      // Must be authored by user or be a Tract commit (no author)
      const authorId = c.author?.id;
      if (authorId && authorId !== user.id) continue;
      // No other participant may have adopted this commit
      const othersAdopted = participants.some(
        (p: any) => p.headCommitId === c.id && p.user?.id !== user.id,
      );
      if (othersAdopted) continue;
      
      s.add(c.id);
    }
    return s;
  }, [commits, user, commitsWithChildren, participants]);

  // Can the user delete the currently viewed commit?
  const canDeleteActiveCommit = useMemo(() => {
    if (!activeCommit || !user) return false;
    // Must be a leaf
    if (commitsWithChildren.has(activeCommit.id)) return false;
    // Must be authored by user or be a Tract commit (no author)
    const authorId = activeCommit.author?.id;
    if (authorId && authorId !== user.id) return false;
    // No other participant may have adopted this commit
    const othersAdopted = participants.some(
      (p) => p.headCommitId === activeCommit.id && p.user?.id !== user.id,
    );
    if (othersAdopted) return false;
    return true;
  }, [activeCommit, user, commitsWithChildren, participants]);

  // Compute, for each of the user's commits, the maximal linear chain of
  // consecutive commits all owned by the user that ends at that commit. A commit
  // is the tip of a squashable chain when this chain has length >= 2.
  // Guards mirror the /api/squash-commits route:
  //   - every commit in the chain is authored by the current user
  //   - the chain is linear (each intermediate has exactly one child)
  //   - no other participant has adopted an intermediate commit
  const squashableChains = useMemo(() => {
    const result = new Map<string, string[]>(); // tipId -> [C1..Cn] ids (oldest first)
    if (!user) return result;
    const map = new Map(commits.map((c) => [c.id, c]));
    const childrenCount = new Map<string, number>();
    for (const c of commits) {
      if (c.parent?.id)
        childrenCount.set(c.parent.id, (childrenCount.get(c.parent.id) ?? 0) + 1);
    }
    for (const tip of commits) {
      if (tip.author?.id !== user.id) continue;
      const chain: string[] = [tip.id];
      let cur = tip;
      while (cur.parent?.id) {
        const parent = map.get(cur.parent.id);
        if (!parent) break;
        if (parent.author?.id !== user.id) break;
        if ((childrenCount.get(parent.id) ?? 0) !== 1) break;
        const adoptedByOther = participants.some(
          (p) => p.headCommitId === parent.id && p.user?.id !== user.id,
        );
        if (adoptedByOther) break;
        chain.push(parent.id);
        cur = parent;
      }
      if (chain.length >= 2) {
        chain.reverse(); // oldest first
        result.set(tip.id, chain);
      }
    }
    return result;
  }, [commits, participants, user]);

  // Commits shown in the History graph. Tract commits (no author) that are not
  // an ancestor of any real user commit are hidden — they are dead-end
  // proposals nobody built on. Participant head commits are pinned so their
  // markers stay consistent even when they point at a Tract proposal.
  const historyCommits = useMemo(() => {
    const pinned = participants
      .map((p) => p.headCommitId)
      .filter((id): id is string => Boolean(id));
    return visibleCommits(commits, pinned);
  }, [commits, participants]);

  const [squashing, setSquashing] = useState(false);

  // Scroll to comment when it becomes available in the DOM
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const commentId = params.get("comment");
    if (!commentId || isLoading) return;

    let attempts = 0;
    const interval = setInterval(() => {
      const element = document.getElementById(`comment-${commentId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("bg-accent/20", "border-accent", "ring-2", "ring-accent/20");
        setTimeout(() => {
          element.classList.remove("bg-accent/20", "border-accent", "ring-2", "ring-accent/20");
        }, 3000);
        clearInterval(interval);
      }
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isLoading, activeTab, selectedIssueId, activePullRequestId]);

  // Auto-scroll the comment thread to the newest comment (or Tract's typing
  // indicator) whenever a comment is added to the currently open issue.
  const commentsStreamRef = useRef<HTMLDivElement>(null);
  const selectedIssueCommentCount = useMemo(() => {
    if (!selectedIssueId) return 0;
    const issue = (contract?.issues ?? []).find((i) => i.id === selectedIssueId);
    return issue?.comments?.length ?? 0;
  }, [contract?.issues, selectedIssueId]);
  const selectedIssueTyping = selectedIssueId
    ? Boolean(typingIssues[selectedIssueId])
    : false;

  useEffect(() => {
    const el = commentsStreamRef.current;
    if (!el) return;
    // Don't hijack a deep-link that targets a specific comment.
    const hasCommentDeepLink = new URLSearchParams(window.location.search).has(
      "comment",
    );
    if (hasCommentDeepLink) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [selectedIssueId, selectedIssueCommentCount, selectedIssueTyping]);

  async function handleSquashCommits(tipCommitId: string) {
    if (!user) return;
    setSquashing(true);
    try {
      const res = await fetch("/api/squash-commits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipCommitId, userId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to squash");
      }
      setViewingCommitId(null);
    } catch (e) {
      console.error("Squash commits failed:", e);
    } finally {
      setSquashing(false);
    }
  }

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingCommitId, setDeletingCommitId] = useState<string | null>(null);

  async function handleDeleteCommit() {
    if (!deletingCommitId || !user) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitId: deletingCommitId, userId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      setDeleteOpen(false);
      setViewingCommitId(null);
      setDeletingCommitId(null);
    } catch (e) {
      console.error("Delete commit failed:", e);
    } finally {
      setDeleting(false);
    }
  }

  // Contract summary — read from InstantDB, regenerate only after new commits
  const summary = contract?.summary
    ? { text: contract.summary as string, generatedAt: contract.summaryGeneratedAt as number }
    : null;
  const commitCountRef = useRef(0);

  // Automatically clean up duplicate participant records for the current user
  useEffect(() => {
    if (!user?.id) return;
    const myParticipants = participants.filter((p: any) => p.user?.id === user.id);
    if (myParticipants.length > 1) {
      // Sort to keep the best one (prefer signed, then newest joinedAt)
      const sorted = [...myParticipants].sort((a: any, b: any) => {
        if (a.signedAt && !b.signedAt) return -1;
        if (!a.signedAt && b.signedAt) return 1;
        return (b.joinedAt || 0) - (a.joinedAt || 0);
      });
      const toDelete = sorted.slice(1);
      const txs = toDelete.map((p: any) => db.tx.participants[p.id].delete());
      db.transact(txs).catch((err: any) => {
        console.error("Failed to clean up duplicate participants:", err);
      });
    }
  }, [participants, user?.id]);

  // Regenerate summary after new commits
  useEffect(() => {
    if (!contractId || commits.length === 0) return;
    if (commitCountRef.current === 0) {
      commitCountRef.current = commits.length;
      return;
    }
    if (commits.length > commitCountRef.current) {
      commitCountRef.current = commits.length;
      fetch("/api/contract-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId, force: true }),
      }).catch(() => {});
    }
  }, [commits.length, contractId]);

  // Walk ancestry from active commit to root
  const versionHistory = useMemo(() => {
    const commitMap = new Map(commits.map((c) => [c.id, c]));
    const chain: typeof commits = [];
    let current = activeCommitId ? commitMap.get(activeCommitId) : undefined;
    while (current) {
      chain.push(current);
      current = current.parent?.id ? commitMap.get(current.parent.id) : undefined;
    }
    return chain;
  }, [commits, activeCommitId]);

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
    const resolvedCommit = commits.find((c: any) => c.id === commitId || c.id.startsWith(commitId));
    const fullCommitId = resolvedCommit ? resolvedCommit.id : commitId;

    if (fullCommitId === myHeadCommitId) {
      // Going back to HEAD
      setViewingCommitId(null);
      setMode("view");
    } else {
      setViewingCommitId(fullCommitId);
      setMode("view"); // Always view when browsing history
    }
  }

  // Remove a participant (owner only)
  async function handleRemoveParticipant(participantId: string) {
    if (!isOwner) return;
    try {
      await db.transact([db.tx.participants[participantId].delete()]);
    } catch (err) {
      console.error("Failed to remove participant:", err);
      alert("Failed to remove participant. Please try again.");
    }
  }

  // Move HEAD to a different commit
  async function handleCheckout(commitId: string) {
    if (isGuestUser(user)) return; // Guests are view-only
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
    if (isGuestUser(user)) return; // Guests are view-only
    setViewingCommitId(null);
    setContent(headCommit?.content ?? "");
    setMode("edit");
  }

  const handleCommit = useCallback(async () => {
    if (isGuestUser(user)) return; // Guests are view-only
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

    const normalizedContent = normalizeMarkdown(content);
    setContent(normalizedContent);

    const newCommitId = id();

    const txs = [
      db.tx.commits[newCommitId]
        .update({
          content: normalizedContent,
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
          content: normalizedContent,
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
    if (!myParticipant || !myHeadCommitId || !user) return;

    setTractStatus({ state: "working", prompt });

    try {
      const res = await fetch("/api/tract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId,
          prompt,
          userId: user.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reach Tract");
      }

      // Tract works asynchronously: it will create a proposed commit and open a
      // pull request to this participant. Those changes stream in via InstantDB.
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

  async function handlePRApprove(
    newContent: string,
    approvedCount: number,
    totalCount: number
  ) {
    if (!activePullRequestId || !user || !contract) return;
    const activePR = contract.pullRequests?.find((p: any) => p.id === activePullRequestId);
    if (!activePR) return;

    const targetParticipant = activePR.targetParticipant;
    const sourceCommit = activePR.sourceCommit;
    const targetHead = commits.find((c: any) => c.id === targetParticipant?.headCommitId);

    if (!targetParticipant || !targetParticipant.id || !targetHead || !sourceCommit) return;

    const normalizedNewcontent = normalizeMarkdown(newContent);
    const normalizedSourcecontent = normalizeMarkdown(sourceCommit.content);

    // Fast-forward
    if (normalizedNewcontent === normalizedSourcecontent) {
      await db.transact([
        db.tx.participants[targetParticipant.id].update({
          headCommitId: sourceCommit.id,
        }),
        db.tx.pullRequests[activePR.id].update({
          status: "merged",
        }),
      ]);
      navigateTo("pull-requests", null, null);
      return;
    }

    // Partial merge
    const newCommitId = id();
    const requesterName = activePR.requester?.email ? displayName(activePR.requester.email) : "Tract";
    const message = `Accept ${approvedCount}/${totalCount} changes from ${requesterName}'s PR`;

    const txs: any[] = [
      db.tx.commits[newCommitId]
        .update({
          content: normalizedNewcontent,
          message,
          createdAt: Date.now(),
        })
        .link({ contract: contractId })
        .link({ parent: targetHead.id }),
      db.tx.participants[targetParticipant.id].update({
        headCommitId: newCommitId,
      }),
    ];

    if (approvedCount >= totalCount) {
      txs.push(
        db.tx.pullRequests[activePR.id].update({
          status: "merged",
        })
      );
    }

    await db.transact(txs);

    if (approvedCount >= totalCount) {
      navigateTo("pull-requests", null, null);
    }
  }

  async function handlePRClose() {
    if (!activePullRequestId || !contract) return;
    const activePR = contract.pullRequests?.find((p: any) => p.id === activePullRequestId);
    if (!activePR) return;

    await db.transact([
      db.tx.pullRequests[activePR.id].update({
        status: "closed",
      }),
    ]);
    navigateTo("pull-requests", null, null);
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

  async function handleVersionSign(legalName: string, signatureData: string) {
    if (!user || !contractId || !activeCommitId) return;
    if (hasMySignatureOnActiveCommit) return;

    const signatureId = id();
    await db.transact([
      db.tx.signatures[signatureId]
        .update({
          legalName,
          signatureData,
          createdAt: Date.now(),
        })
        .link({ commit: activeCommitId })
        .link({ contract: contractId })
        .link({ creator: user.id }),
    ]);
  }

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(true);
  const pendingDownload = useRef(false);

  function downloadPdf(legalName?: string, signatureData?: string) {
    if (!contract) return;
    setDownloading(true);
    const withSig = includeSignature;
    const sigName = legalName ?? myParticipant?.legalName;
    const sigData = signatureData ?? myParticipant?.signatureData;

    const activeSigs = (contract?.signatures ?? []).filter(
      (sig: any) => sig.commit?.id === activeCommitId
    );

    const pdfSignatures = activeSigs.length > 0
      ? activeSigs.map((sig: any) => ({
          legalName: sig.legalName,
          signatureData: sig.signatureData,
          signedAt: sig.createdAt,
        }))
      : (withSig && sigName && sigData ? [{
          legalName: sigName,
          signatureData: sigData,
          signedAt: myParticipant?.signedAt ?? Date.now(),
        }] : undefined);

    fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: contract.name,
        content: displayContent,
        signatures: pdfSignatures,
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
      .finally(() => {
        setDownloading(false);
        setDownloadOpen(false);
      });
  }

  function handleDownloadConfirm() {
    if (includeSignature && !myParticipant?.signatureData) {
      pendingDownload.current = true;
      setSignOpen(true);
      return;
    }
    downloadPdf();
  }

  // Unique participants (deduplicated by user ID or email)
  const uniqueParticipants = useMemo(() => {
    const seen = new Set<string>();
    return participants.filter((p: any) => {
      const key = p.user?.id || p.email || p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [participants]);

  // Who approves the currently displayed version? (deduplicated by user ID or email)
  // Guests (participants without an email) are view-only and never approve a version.
  const approvers = useMemo(() => {
    if (!activeCommitId) return [];
    const list = participants.filter(
      (p: any) => p.headCommitId === activeCommitId && !!p.email,
    );
    const seen = new Set<string>();
    return list.filter((p: any) => {
      const key = p.user?.id || p.email || p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeCommitId, participants]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (!contract || !myParticipant) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="rounded-full bg-muted p-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-lg font-medium">No access to this document</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          This document either doesn&apos;t exist or you haven&apos;t been invited.
          Make sure you&apos;re signed in with the email the owner used to invite you.
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
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

            {/* Top Signature Badges */}
            {activeCommitSignatures.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeCommitSignatures.length >= Math.max(2, uniqueParticipants.length) ? (
                  <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600 text-white">
                    ✓ Fully Signed
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    ✍️ Signed ({activeCommitSignatures.length}/{uniqueParticipants.length})
                  </Badge>
                )}
                {hasMySignatureOnActiveCommit && (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    Signed by you
                  </Badge>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {isViewingHistory
              ? `Viewing: ${activeCommitId?.slice(0, 7)} (not your current version)`
              : `Your version: ${myHeadCommitId?.slice(0, 7) ?? "none"}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isGuest && (
            <span className="text-xs text-muted-foreground border border-border rounded px-2 py-1">
              View-only (guest)
            </span>
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
          {!isGuest && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTractOpen(true)}
              disabled={tractStatus?.state === "working"}
            >
              Ask Tract
            </Button>
          )}
          {!isGuest && mode === "view" && displayContent.trim() && !hasMySignatureOnActiveCommit && (
            <Button
              variant="outline"
              size="sm"
              className="border-accent/40 text-accent hover:bg-accent/10 hover:text-accent font-semibold flex items-center gap-1.5"
              onClick={() => setVersionSignOpen(true)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pen-tool">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              Sign this version
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDownloadOpen(true)}
            disabled={downloading || !displayContent.trim()}
          >
            {downloading ? "Generating..." : "Download PDF"}
          </Button>
          {!isGuest && (
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
              Invite
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-border">
        <button
          onClick={() => navigateTo("document")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-[2px] ${
            activeTab === "document"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Document
        </button>
        <button
          onClick={() => navigateTo("issues", selectedIssueId)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-[2px] ${
            activeTab === "issues"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Issues & Discussions
        </button>
        <button
          onClick={() => navigateTo("pull-requests")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-[2px] ${
            activeTab === "pull-requests"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Pull Requests
        </button>
        <button
          onClick={() => navigateTo("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-[2px] ${
            activeTab === "history"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Version History
        </button>
      </div>

      {activeTab === "issues" ? (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 min-h-[500px]">
          {/* Left Column: Issues List */}
          <div className="space-y-4 border-r border-border pr-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Issues List</h3>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-2"
                onClick={() => navigateTo("issues", null)}
              >
                + New
              </Button>
            </div>

            {(() => {
              const issues = contract?.issues ?? [];
              const activeIssues = issues.filter((i: any) => i.status !== "closed");
              const closedIssues = issues.filter((i: any) => i.status === "closed");
              return (
                <div className="flex bg-muted p-1 rounded-md text-xs">
                  <button
                    onClick={() => setIssueFilter("active")}
                    className={`flex-1 py-1 rounded text-center font-medium transition-colors cursor-pointer ${
                      issueFilter === "active"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Active ({activeIssues.length})
                  </button>
                  <button
                    onClick={() => setIssueFilter("closed")}
                    className={`flex-1 py-1 rounded text-center font-medium transition-colors cursor-pointer ${
                      issueFilter === "closed"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Archived ({closedIssues.length})
                  </button>
                </div>
              );
            })()}

            <div className="space-y-2">
              {(() => {
                const issues = contract?.issues ?? [];
                const filtered = [...issues]
                  .filter((issue: any) => issueFilter === "active" ? issue.status !== "closed" : issue.status === "closed")
                  .sort((a: any, b: any) => b.createdAt - a.createdAt);

                if (filtered.length === 0) {
                  return (
                    <p className="text-xs text-muted-foreground italic py-8 text-center">
                      No {issueFilter === "active" ? "active" : "archived"} issues.
                    </p>
                  );
                }
                return filtered.map((issue: any) => {
                  const isSelected = selectedIssueId === issue.id;
                  const isClosed = issue.status === "closed";
                  return (
                    <button
                      key={issue.id}
                      onClick={() => navigateTo("issues", issue.id)}
                      className={`w-full text-left p-3 rounded-lg border text-xs space-y-1 transition-all ${
                        isSelected
                          ? "bg-secondary border-ring/40"
                          : "bg-card hover:bg-secondary/40 border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          isClosed ? "bg-slate-500/10 text-slate-500 dark:text-slate-400" : "bg-green-500/10 text-green-500"
                        }`}>
                          {isClosed ? "Closed" : "Active"}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {new Date(issue.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <h4 className="font-medium text-foreground truncate" dir="auto">{issue.title}</h4>
                      {issue.commit && (
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 mt-1">
                          <span>v:</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (issue.commit) {
                                handleSelectCommit(issue.commit.id);
                                navigateTo("document", issue.id);
                              }
                            }}
                            className="underline text-accent hover:text-accent/80 font-semibold cursor-pointer"
                            title="Jump to this version in the document panel"
                          >
                            {issue.commit.id.slice(0, 7)}
                          </button>
                        </div>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* Right Column: Active Issue View or Create Form */}
          <div className="space-y-4">
            {(() => {
              const issues = contract?.issues ?? [];
              const activeIssue = issues.find((issue: any) => issue.id === selectedIssueId);

              if (!activeIssue) {
                // New Issue Form
                return (
                  <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
                    <h3 className="text-sm font-medium">Create a new issue / discussion thread</h3>
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
                        className="min-h-[120px] text-sm bg-card"
                      />
                      <div className="flex items-center justify-between">
                        {activeCommitId ? (
                          <p className="text-[10px] text-muted-foreground">
                            Linking this issue to currently viewed version: <span className="font-mono">{activeCommitId.slice(0, 7)}</span>
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">General issue for this contract</p>
                        )}
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
                            Create issue
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              const comments = [...(activeIssue.comments ?? [])].sort((a: any, b: any) => a.createdAt - b.createdAt);
              const isClosed = activeIssue.status === "closed";
              const creatorEmail = activeIssue.creator?.email ? displayName(activeIssue.creator.email) : "Unknown user";

              return (
                <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          isClosed ? "bg-slate-500/10 text-slate-500 dark:text-slate-400" : "bg-green-500/10 text-green-500"
                        }`}>
                          {isClosed ? "Closed" : "Active"}
                        </span>
                        <h2 className="text-base font-semibold" dir="auto">{activeIssue.title}</h2>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Started by {creatorEmail} &middot; {new Date(activeIssue.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {activeIssue.commit && (
                        <p className="text-[10px] text-muted-foreground font-mono mt-1 flex items-center gap-1.5">
                          <span>Associated with version:</span>
                          <button
                            onClick={() => {
                              if (activeIssue.commit) {
                                handleSelectCommit(activeIssue.commit.id);
                                navigateTo("document", activeIssue.id);
                              }
                            }}
                            className="underline text-accent hover:text-accent/80 font-semibold cursor-pointer"
                            title="Jump to this version in the document panel"
                          >
                            {activeIssue.commit.id.slice(0, 7)}
                          </button>
                        </p>
                      )}
                    </div>
                    {user && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8"
                        onClick={() => handleToggleIssueStatus(activeIssue.id, activeIssue.status)}
                      >
                        {isClosed ? "Reopen issue" : "Close issue"}
                      </Button>
                    )}
                  </div>

                  {/* Comments Stream */}
                  <div ref={commentsStreamRef} className="space-y-4 max-h-[350px] overflow-y-auto pr-2 pl-2">
                    {comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No comments yet.</p>
                    ) : (
                      comments.map((comment: any) => {
                        const isTract = !comment.creator;
                        const commenterEmail = !isTract
                          ? (comment.creator?.email ? displayName(comment.creator.email) : "Unknown user")
                          : "Tract";
                        return (
                          <div
                            key={comment.id}
                            className={`group/comment text-xs space-y-1 p-3 rounded-lg border transition-colors ${
                              isTract
                                ? "bg-accent/5 border-accent/20 dark:bg-accent/5"
                                : "bg-muted/40 border-border/50"
                            }`}
                          >
                            <div className="flex items-center justify-between text-muted-foreground">
                              <div className="flex items-center gap-2">
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
                              {comment.creator?.id === user?.id && (
                                <button
                                  onClick={() => handleDeleteComment(comment.id)}
                                  className="opacity-0 group-hover/comment:opacity-100 transition-opacity text-[10px] text-muted-foreground hover:text-destructive cursor-pointer"
                                  title="Delete comment"
                                >
                                  delete
                                </button>
                              )}
                            </div>
                            <div className="text-foreground/90 whitespace-pre-wrap" dir="auto">
                              <LinkifiedText text={comment.content} />
                            </div>
                          </div>
                        );
                      })
                    )}
                    {typingIssues[activeIssue.id] && (
                      <div className="text-xs space-y-1 bg-accent/5 p-3 rounded-lg border border-accent/20 animate-pulse flex items-center gap-2 text-muted-foreground">
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
                        <span>is typing a response...</span>
                      </div>
                    )}
                  </div>

                  {/* Reply Form */}
                  {!isClosed && user && (
                    <div className="space-y-2 pt-3 border-t border-border">
                      <MentionTextarea
                        placeholder="Type your reply here..."
                        value={replyContents[activeIssue.id] ?? ""}
                        onChange={(val) => setReplyContents({ ...replyContents, [activeIssue.id]: val })}
                        suggestions={mentionSuggestions}
                        className="min-h-[80px] text-xs"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleReply(activeIssue.id)}
                          disabled={!(replyContents[activeIssue.id] ?? "").trim()}
                        >
                          Send reply
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      ) : activeTab === "pull-requests" ? (
        <div className="space-y-6 min-h-[500px]">
          {activePullRequestId ? (
            (() => {
              const activePR = contract?.pullRequests?.find((p: any) => p.id === activePullRequestId);
              if (!activePR) return <div>PR not found</div>;
              
              const targetParticipant = activePR.targetParticipant;
              const sourceCommit = activePR.sourceCommit;
              const targetHead = commits.find((c: any) => c.id === targetParticipant?.headCommitId);
              
              if (!targetHead || !sourceCommit) {
                return <div className="text-sm text-muted-foreground">Missing commit data for this Pull Request</div>;
              }
              
              const isTargetUser = targetParticipant?.user?.id === user?.id;
              
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground -ml-2 mb-2"
                        onClick={() => navigateTo("pull-requests", null, null)}
                      >
                        &larr; Back to Pull Requests
                      </Button>
                      <h2 className="text-lg font-semibold tracking-tight">Review Pull Request</h2>
                      <p className="text-xs text-muted-foreground">
                        Proposal from {activePR.requester?.email ? displayName(activePR.requester.email) : "Tract"} to merge changes into {targetParticipant?.email ? displayName(targetParticipant.email) : "their version"}
                      </p>
                    </div>
                    {isTargetUser && activePR.status === "open" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive text-xs"
                        onClick={handlePRClose}
                      >
                        Close Pull Request
                      </Button>
                    )}
                  </div>
                  
                  <DiffViewer
                    key={`${targetHead.id}-${sourceCommit.id}`}
                    myContent={targetHead.content}
                    theirContent={sourceCommit.content}
                    theirEmail={activePR.requester?.email ?? "Tract"}
                    onApprove={isTargetUser ? handlePRApprove : undefined}
                    contractId={contractId}
                    commitId={sourceCommit.id}
                    issues={contract?.issues ?? []}
                    commits={commits}
                    myParticipant={myParticipant}
                    contractName={contract?.name ?? ""}
                    onCommentClick={(issueId, commentId) => navigateTo("pull-requests", issueId, activePullRequestId, commentId)}
                  />
                  
                  {!isTargetUser && (
                    <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs text-muted-foreground text-center">
                      Only the target participant ({targetParticipant?.email ? displayName(targetParticipant.email) : "the owner of this version"}) can merge/approve these changes.
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="font-semibold text-sm">Pull Requests</h3>
                  <p className="text-xs text-muted-foreground">Proposed changes waiting to be merged into versions</p>
                </div>
              </div>
              
              {(() => {
                const prs = contract?.pullRequests ?? [];
                const activePRs = prs.filter((pr: any) => pr.status === "open");
                const archivedPRs = prs.filter((pr: any) => pr.status === "merged" || pr.status === "closed");

                return (
                  <>
                    {activePRs.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic py-8 text-center border rounded-lg bg-card/10">
                        No active pull requests.
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {activePRs.map((pr: any) => {
                          const isOpen = pr.status === "open";
                          const isTargetMe = pr.targetParticipant?.user?.id === user?.id;
                          const requesterName = pr.requester?.email ? displayName(pr.requester.email) : "Tract";
                          const targetName = pr.targetParticipant?.user?.id === user?.id ? "Your version" : (pr.targetParticipant?.email ? displayName(pr.targetParticipant.email) : "unknown");
                          
                          return (
                            <div key={pr.id} className="p-4 rounded-lg border border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full font-medium bg-green-500/10 text-green-500">
                                    Open
                                  </span>
                                  <span className="font-semibold text-sm text-foreground">
                                    {pr.message || "Pull Request"}
                                  </span>
                                </div>
                                <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span>Requested by <strong className="text-foreground">{requesterName}</strong></span>
                                  <span>&bull;</span>
                                  <span>Target: <strong className="text-foreground">{targetName}</strong></span>
                                  <span>&bull;</span>
                                  <span>{new Date(pr.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigateTo("pull-requests", null, pr.id)}
                                >
                                  {isTargetMe ? "Review & Merge" : "View Comparison"}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {archivedPRs.length > 0 && (
                      <div className="space-y-3 pt-4 border-t border-border/40 mt-6">
                        <button
                          onClick={() => setPrArchivedExpanded(!prArchivedExpanded)}
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full text-left"
                        >
                          <span>{prArchivedExpanded ? "▼" : "▶"} Archived Pull Requests ({archivedPRs.length})</span>
                        </button>

                        {prArchivedExpanded && (
                          <div className="grid gap-3 mt-2 pl-1">
                            {archivedPRs.map((pr: any) => {
                              const isMerged = pr.status === "merged";
                              const isClosed = pr.status === "closed";
                              const requesterName = pr.requester?.email ? displayName(pr.requester.email) : "Tract";
                              const targetName = pr.targetParticipant?.user?.id === user?.id ? "Your version" : (pr.targetParticipant?.email ? displayName(pr.targetParticipant.email) : "unknown");

                              return (
                                <div key={pr.id} className="p-4 rounded-lg border border-border bg-card/60 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs opacity-80">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium ${
                                        isMerged ? "bg-blue-500/10 text-blue-500" : "bg-red-500/10 text-red-500"
                                      }`}>
                                        {isMerged ? "Merged" : "Closed"}
                                      </span>
                                      <span className="font-semibold text-sm text-foreground">
                                        {pr.message || "Pull Request"}
                                      </span>
                                    </div>
                                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span>Requested by <strong className="text-foreground">{requesterName}</strong></span>
                                      <span>&bull;</span>
                                      <span>Target: <strong className="text-foreground">{targetName}</strong></span>
                                      <span>&bull;</span>
                                      <span>{new Date(pr.createdAt).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => navigateTo("pull-requests", null, pr.id)}
                                    >
                                      View Comparison
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      ) : activeTab === "history" ? (
        <div className="space-y-6 max-w-3xl mx-auto py-2">
          <div>
            <h2 className="text-base font-semibold">Version History (Ancestry Path)</h2>
            <p className="text-xs text-muted-foreground">
              The direct lineage of edits leading from the initial draft to your currently selected version.
            </p>
          </div>

          {versionHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground italic py-12 text-center">
              No version history found.
            </div>
          ) : (
            <div className="relative border-l-2 border-border/60 ml-3 pl-6 space-y-6">
              {versionHistory.map((c) => {
                const authorLabel = c.author?.email
                  ? displayName(c.author.email)
                  : "Tract";
                const date = new Date(c.createdAt);
                const isActive = c.id === activeCommitId;

                return (
                  <div key={c.id} className="relative group">
                    {/* Timeline dot */}
                    <span className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-background flex items-center justify-center transition-all ${
                      isActive
                        ? "border-accent ring-4 ring-accent/10"
                        : "border-border/80 group-hover:border-muted-foreground/60"
                    }`}>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    </span>

                    <div className={`p-4 rounded-lg border transition-all ${
                      isActive
                        ? "bg-accent/5 border-accent/30 shadow-sm"
                        : "bg-card border-border hover:border-muted-foreground/30 hover:shadow-sm"
                    }`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-muted">
                            {c.id.slice(0, 7)}
                          </span>
                          <span className="text-xs font-medium text-foreground" title={c.author?.email || undefined}>
                            {authorLabel}
                          </span>
                          <span className="text-muted-foreground/50 text-[10px]">&bull;</span>
                          <span className="text-muted-foreground/70 text-[11px]">
                            {date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <Badge variant="outline" className="text-[10px] border-accent/30 text-accent font-semibold">
                              Currently Viewing
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[11px] h-7 px-2.5"
                              onClick={() => {
                                handleSelectCommit(c.id);
                                navigateTo("document");
                              }}
                            >
                              View this version
                            </Button>
                          )}
                        </div>
                      </div>

                      {c.message ? (
                        <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{c.message}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No description provided</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
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
                  dir="auto"
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
                    {approvers.length === uniqueParticipants.length && uniqueParticipants.length >= 2 && (
                      <Badge variant="default" className="text-[10px] bg-green-600/90 text-white ml-1">
                        🎉 Consensus
                      </Badge>
                    )}
                  </div>
                )}

                {/* Contract summary (AI-generated) */}
                {!isViewingHistory && summary && (
                  <CollapsibleSummary text={summary.text} />
                )}

                <div className="relative min-h-[500px] px-8 py-6 rounded-lg border border-border bg-card">
                  {mode === "view" && displayContent.trim() && (
                    <div className="absolute top-3 start-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {/* Copy button */}
                      <button
                        className="hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(displayContent);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>

                      <span>&bull;</span>

                      {/* Edit option */}
                      {!isGuest && !isViewingHistory && (
                        <>
                          <button
                            className="hover:text-foreground transition-colors cursor-pointer font-medium"
                            onClick={enterEditMode}
                          >
                            Edit
                          </button>
                          <span>&bull;</span>
                        </>
                      )}

                      {/* Adopt version option */}
                      {isViewingHistory && !isGuest && (
                        <>
                          <button
                            className="hover:text-foreground transition-colors cursor-pointer font-semibold text-accent"
                            onClick={() => handleCheckout(activeCommitId!)}
                          >
                            Adopt version
                          </button>
                          <span>&bull;</span>
                        </>
                      )}

                      {/* Compare version option */}
                      {isViewingHistory && (
                        <>
                          <button
                            className="hover:text-foreground transition-colors cursor-pointer"
                            onClick={() => router.push(`/app/contract/${contractId}/compare/${activeCommitId}`)}
                          >
                            Compare to my version
                          </button>
                          <span>&bull;</span>
                        </>
                      )}

                      {/* View changes from parent */}
                      <button
                        className="hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => setCommitDetailOpen(true)}
                      >
                        View changes from parent
                      </button>

                      <span>&bull;</span>

                      {/* Comment on this version */}
                      <button
                        className="hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => {
                          setNewIssueTitle(`Discussion on version ${activeCommitId?.slice(0, 7)}`);
                          navigateTo("issues", null);
                        }}
                      >
                        Comment on this version
                      </button>
                    </div>
                  )}
                  {!displayContent.trim() ? (
                    <div className="text-sm text-muted-foreground italic py-8 text-center">
                      Empty document
                    </div>
                  ) : (
                    <MarkdownView
                      content={displayContent}
                      issues={contract?.issues ?? []}
                      contractId={contractId}
                      commitId={activeCommit?.id}
                      triggerTractReply={triggerTractReply}
                      onCommentClick={(issueId, commentId) => navigateTo("document", issueId, null, commentId)}
                    />
                  )}

                  {/* Signatures on this version */}
                  {mode === "view" && displayContent.trim() && (
                    <div className="mt-8 pt-6 border-t border-border/60">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Signatures on this version
                        </h4>
                        {!hasMySignatureOnActiveCommit && !isGuest && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 px-3 flex items-center gap-1.5"
                            onClick={() => setVersionSignOpen(true)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pen-tool">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              <path d="m9 12 2 2 4-4" />
                            </svg>
                            Sign this version
                          </Button>
                        )}
                      </div>

                      {activeCommitSignatures.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                          {activeCommitSignatures.map((sig: any) => {
                            const isMe = sig.creator?.id === user?.id;
                            const email = sig.creator?.email ? displayName(sig.creator.email) : "Unknown signer";
                            return (
                              <div key={sig.id} className="p-3 rounded-lg border border-border/80 bg-muted/10 relative">
                                {sig.signatureData.startsWith("data:image/png;base64,") && (
                                  <img
                                    src={sig.signatureData}
                                    alt={`Signature of ${sig.legalName}`}
                                    className="h-16 object-contain bg-white rounded border p-1"
                                  />
                                )}
                                <div className="mt-2 text-xs font-semibold">{sig.legalName}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  Signed by {isMe ? "You" : email} on {new Date(sig.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic mt-2">No signatures on this version yet.</p>
                      )}

                      {/* Advice for co-signers */}
                      {activeCommitSignatures.length >= 2 && (
                        <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-700 dark:text-green-400 flex items-start gap-2">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                            <rect width="20" height="16" x="2" y="4" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                          <div>
                            <span className="font-semibold">🎉 Version Fully Signed!</span> Both parties have signed this exact version.
                            When you download the PDF, both signatures will be included side-by-side.
                            <p className="mt-1 font-medium text-green-600 dark:text-green-300">
                              Advise signers to also send it to each other via email for record keeping.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
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
              onRemove={isOwner ? handleRemoveParticipant : undefined}
              isOwner={isOwner}
              colorMap={colorMap}
            />

            <Separator />

            <CommitLog
              commits={historyCommits}
              headCommitId={myHeadCommitId}
              viewingCommitId={activeCommitId}
              participants={participants}
              currentUserId={user?.id ?? ""}
              onSelectCommit={handleSelectCommit}
              onCheckout={handleCheckout}
              colorMap={colorMap}
              squashableChains={isGuest ? undefined : squashableChains}
              onSquash={handleSquashCommits}
              squashing={squashing}
              deletableCommitIds={deletableCommitIds}
              onDeleteCommit={(cid) => {
                setDeletingCommitId(cid);
                setDeleteOpen(true);
              }}
            />
          </div>
        </div>
      )}

      <InviteDialog
        contractId={contractId}
        myHeadCommitId={myHeadCommitId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />

      <TractDialog
        open={tractOpen}
        onOpenChange={setTractOpen}
        onSubmit={handleTractSubmit}
        isViewingOwnVersion={!isViewingHistory}
        onGoToOwnVersion={() => setViewingCommitId(null)}
      />

      <CommitDetailDialog
        commit={activeCommit ?? null}
        parentCommit={activeParentCommit}
        open={commitDetailOpen}
        onOpenChange={setCommitDetailOpen}
        contractId={contractId}
        issues={contract?.issues ?? []}
        participants={participants}
        user={user}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete commit?</DialogTitle>
            <DialogDescription>
              This will permanently remove commit{" "}
              <span className="font-mono">{activeCommitId?.slice(0, 7)}</span>.
              {activeCommitId === myHeadCommitId
                ? " Your version will move back to the parent commit."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteCommit}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        onSign={handleSign}
        existingName={myParticipant?.legalName ?? undefined}
      />

      <SignDialog
        open={versionSignOpen}
        onOpenChange={setVersionSignOpen}
        onSign={handleVersionSign}
        existingName={myParticipant?.legalName ?? undefined}
      />

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Download PDF</DialogTitle>
            <DialogDescription>
              Export this contract as a PDF document.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={includeSignature}
                onCheckedChange={(v) => setIncludeSignature(!!v)}
              />
              <div>
                <span className="text-sm">Include my signature</span>
                {includeSignature && !myParticipant?.signatureData && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    You&apos;ll be asked to draw your signature
                  </p>
                )}
                {includeSignature && myParticipant?.signatureData && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Signed as {myParticipant.legalName}
                  </p>
                )}
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDownloadOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleDownloadConfirm} disabled={downloading}>
              {downloading ? "Generating..." : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
