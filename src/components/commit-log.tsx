"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

interface Commit {
  id: string;
  message: string;
  createdAt: number;
  author?: { id: string; email?: string };
}

interface CommitLogProps {
  commits: Commit[];
  headCommitId?: string;
}

export function CommitLog({ commits, headCommitId }: CommitLogProps) {
  const sorted = [...commits].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        History
      </div>

      <ScrollArea className="max-h-[300px]">
        <div className="space-y-1">
          {sorted.map((commit, i) => {
            const isHead = commit.id === headCommitId;
            const authorEmail = commit.author?.email ?? "unknown";
            const timeAgo = getTimeAgo(commit.createdAt);

            return (
              <div
                key={commit.id}
                className={`px-3 py-2 rounded-md text-sm ${
                  isHead
                    ? "bg-accent/10 border border-accent/20"
                    : "hover:bg-secondary/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isHead && (
                    <span className="text-[10px] font-mono font-semibold text-accent">
                      HEAD
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">
                    {commit.id.slice(0, 7)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs">{commit.message}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {authorEmail} &middot; {timeAgo}
                </div>
                {i < sorted.length - 1 && (
                  <div className="flex justify-center mt-1">
                    <div className="w-px h-2 bg-border" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
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
