"use client";

/* eslint-disable react-hooks/purity */

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { displayName } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface MarkdownViewProps {
  content: string;
  issues?: any[];
  contractId?: string;
  commitId?: string;
  triggerTractReply?: (issueId: string, issueTitle: string, currentComment: string, existingComments: any[]) => Promise<void>;
  onCommentClick?: (issueId: string, commentId: string) => void;
}

interface ProseBlockProps {
  lineNumber?: number;
  children: React.ReactNode;
  issues: any[];
  contractId?: string;
  commitId?: string;
  user: any;
  triggerTractReply?: (issueId: string, issueTitle: string, currentComment: string, existingComments: any[]) => Promise<void>;
  onCommentClick?: (issueId: string, commentId: string) => void;
}

export function ProseBlock({
  lineNumber,
  children,
  issues,
  contractId,
  commitId,
  user,
  triggerTractReply,
  onCommentClick,
}: ProseBlockProps) {
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [newCommentInput, setNewCommentInput] = useState("");
  const [commentReplyContents, setCommentReplyContents] = useState<{ [issueId: string]: string }>({});

  const lineIssues = useMemo(() => {
    if (lineNumber === undefined) return [];
    return issues.filter(
      (issue) => issue.lineNumber === lineNumber
    );
  }, [issues, lineNumber]);

  async function handleCreateComment() {
    if (!user || !contractId || !newCommentInput.trim() || lineNumber === undefined) return;

    const issueId = id();
    const commentId = id();

    const txs = [
      db.tx.issues[issueId]
        .update({
          title: `Line ${lineNumber} Discussion`,
          createdAt: Date.now(),
          status: "open",
          lineNumber,
          lineType: "unchanged",
        })
        .link({ contract: contractId })
        .link({ creator: user.id }),
      db.tx.comments[commentId]
        .update({
          content: newCommentInput.trim(),
          createdAt: Date.now(),
        })
        .link({ issue: issueId })
        .link({ creator: user.id }),
    ];

    if (commitId) {
      txs[0] = db.tx.issues[issueId]
        .update({
          title: `Line ${lineNumber} Discussion`,
          createdAt: Date.now(),
          status: "open",
          lineNumber,
          lineType: "unchanged",
        })
        .link({ contract: contractId })
        .link({ creator: user.id })
        .link({ commit: commitId });
    }

    await db.transact(txs);
    const content = newCommentInput.trim();
    setNewCommentInput("");
    setShowCommentForm(false);

    if (triggerTractReply && /\B@\s*tract\b/i.test(content)) {
      triggerTractReply(issueId, `Line ${lineNumber} Discussion`, content, []);
    }
  }

  async function handleReplyComment(issueId: string, content: string) {
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

    if (triggerTractReply && /\B@\s*tract\b/i.test(content)) {
      const activeIssue = issues.find((issue: any) => issue.id === issueId);
      const previousComments = activeIssue?.comments ?? [];
      triggerTractReply(issueId, activeIssue?.title ?? `Line ${lineNumber} Discussion`, content, previousComments);
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

  const hasComments = lineIssues.length > 0 || showCommentForm;

  return (
    <div className="group/prose relative my-3">
      {/* The actual markdown content element (p, h1, etc.) */}
      <div className="flex items-start gap-3">
        {/* Comment button left in margin */}
        {user && lineNumber !== undefined && (
          <button
            onClick={() => {
              setShowCommentForm(!showCommentForm);
              setNewCommentInput("");
            }}
            className={`p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all shrink-0 mt-1 ${
              showCommentForm
                ? "opacity-100 bg-accent text-foreground"
                : "opacity-0 group-hover/prose:opacity-100"
            }`}
            title="Comment on this section"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>

      {/* Existing and new comments */}
      {hasComments && (
        <div className="mt-2 ml-8 space-y-3 pl-4 border-l-2 border-accent/20">
          {lineIssues.map((issue) => {
            const comments = [...(issue.comments ?? [])].sort((a: any, b: any) => a.createdAt - b.createdAt);
            const isClosed = issue.status === "closed";
            const replyKey = issue.id;

            return (
              <div key={issue.id} className="p-3 rounded-lg border border-border bg-background space-y-2 max-w-xl text-xs">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/40 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium ${
                      isClosed ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                    }`}>
                      {isClosed ? "Closed" : "Active"}
                    </span>
                    <span className="font-semibold text-foreground">
                      Section Discussion
                    </span>
                  </div>
                  <span>{new Date(issue.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
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
                              onClick={() => handleDeleteComment(comment.id)}
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
                </div>

                {/* Reply Form */}
                {!isClosed && user && (
                  <div className="flex items-center gap-2 pt-1.5 border-t border-border/30">
                    <Input
                      placeholder="Reply inline..."
                      value={commentReplyContents[replyKey] ?? ""}
                      onChange={(e) => setCommentReplyContents({ ...commentReplyContents, [replyKey]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (commentReplyContents[replyKey] ?? "").trim()) {
                          handleReplyComment(replyKey, commentReplyContents[replyKey]);
                        }
                      }}
                      className="text-[11px] h-7 bg-muted/20"
                    />
                    <Button
                      size="sm"
                      className="h-7 text-[10px] px-2"
                      onClick={() => handleReplyComment(replyKey, commentReplyContents[replyKey])}
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
            <div className="p-3 rounded-lg border border-border bg-background space-y-2 max-w-xl text-xs">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
                Add comment/feedback on this section
              </span>
              <Textarea
                placeholder="Write your comment/feedback here..."
                value={newCommentInput}
                onChange={(e) => setNewCommentInput(e.target.value)}
                className="min-h-[60px] text-xs"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px]"
                  onClick={() => setShowCommentForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={handleCreateComment}
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

export function MarkdownView({
  content,
  issues = [],
  contractId,
  commitId,
  triggerTractReply,
  onCommentClick,
}: MarkdownViewProps) {
  const { user } = db.useAuth();

  if (!content.trim()) {
    return (
      <div className="text-sm text-muted-foreground italic py-8 text-center">
        Empty document
      </div>
    );
  }

  return (
    <div className="prose-contract">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <p {...props} dir="auto">{children}</p>
            </ProseBlock>
          ),
          h1: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <h1 {...props} dir="auto">{children}</h1>
            </ProseBlock>
          ),
          h2: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <h2 {...props} dir="auto">{children}</h2>
            </ProseBlock>
          ),
          h3: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <h3 {...props} dir="auto">{children}</h3>
            </ProseBlock>
          ),
          h4: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <h4 {...props} dir="auto">{children}</h4>
            </ProseBlock>
          ),
          h5: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <h5 {...props} dir="auto">{children}</h5>
            </ProseBlock>
          ),
          h6: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <h6 {...props} dir="auto">{children}</h6>
            </ProseBlock>
          ),
          li: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <li {...props} dir="auto">{children}</li>
            </ProseBlock>
          ),
          ol: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <ol {...props} dir="auto">{children}</ol>
            </ProseBlock>
          ),
          ul: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <ul {...props} dir="auto">{children}</ul>
            </ProseBlock>
          ),
          blockquote: ({ node, children, ...props }: any) => (
            <ProseBlock
              lineNumber={node?.position?.start?.line}
              issues={issues}
              contractId={contractId}
              commitId={commitId}
              user={user}
              triggerTractReply={triggerTractReply}
              onCommentClick={onCommentClick}
            >
              <blockquote {...props} dir="auto">{children}</blockquote>
            </ProseBlock>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
