"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InlineDiffView } from "@/components/inline-diff-view";

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
}

export function CommitDetailDialog({
  commit,
  parentCommit,
  open,
  onOpenChange,
}: CommitDetailDialogProps) {
  if (!commit) return null;

  const isTract = !commit.author;
  const authorLabel = isTract
    ? "Tract"
    : (commit.author?.email?.split("@")[0] ?? "unknown");

  const date = new Date(commit.createdAt);
  const dateStr = date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-mono text-sm">
            {commit.id.slice(0, 7)}
          </DialogTitle>
          <DialogDescription>
            {authorLabel} &middot; {dateStr}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm shrink-0">{commit.message}</p>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 shrink-0">
            Changes
          </div>
          <div className="flex-1 min-h-0 rounded-lg border border-border overflow-y-auto">
            <InlineDiffView
              baseContent={parentCommit?.content ?? ""}
              compareContent={commit.content}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
