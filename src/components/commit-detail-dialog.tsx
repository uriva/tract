"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DiffViewer } from "@/components/diff-viewer";
import { displayName } from "@/lib/utils";

interface Commit {
  id: string;
  message: string;
  content: string;
  createdAt: number;
  author?: { id: string; email?: string };
  parent?: { id: string };
}

interface CommitDetailDialogProps {
  commit: Commit | null;
  parentCommit: Commit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId?: string;
  issues?: any[];
}

export function CommitDetailDialog({
  commit,
  parentCommit,
  open,
  onOpenChange,
  contractId,
  issues = [],
}: CommitDetailDialogProps) {
  if (!commit) return null;

  const isTract = !commit.author;
  const authorLabel = isTract
    ? "Tract"
    : displayName(commit.author?.email, commit.author?.id);

  const date = new Date(commit.createdAt);
  const dateStr = date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-mono text-sm">
            {commit.id.slice(0, 7)}
          </DialogTitle>
          <DialogDescription>
            <span title={commit.author?.email || undefined}>{authorLabel}</span> &middot; {dateStr}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm shrink-0">{commit.message}</p>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 shrink-0">
            Changes
          </div>
          <div className="flex-1 min-h-0 rounded-lg border border-border overflow-y-auto p-4">
            <DiffViewer
              key={`${parentCommit?.id}-${commit.id}`}
              myContent={parentCommit?.content ?? ""}
              theirContent={commit.content}
              theirEmail={commit.author?.email ?? "Tract"}
              contractId={contractId}
              commitId={commit.id}
              issues={issues}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
