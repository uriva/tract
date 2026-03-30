"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { displayName } from "@/lib/utils";

interface Participant {
  id: string;
  role: string;
  email: string;
  headCommitId?: string;
  user?: { id: string; email?: string };
}

interface Commit {
  id: string;
  createdAt: number;
  parent?: { id: string };
}

interface ParticipantListProps {
  participants: Participant[];
  commits: Commit[];
  currentUserId: string;
  contractId: string;
  myHeadCommitId?: string;
  onSelectVersion?: (commitId: string) => void;
  colorMap?: Map<string, string>;
}

export function ParticipantList({
  participants,
  commits,
  currentUserId,
  contractId,
  myHeadCommitId,
  onSelectVersion,
  colorMap,
}: ParticipantListProps) {
  const me = participants.find(
    (p) => p.user?.id === currentUserId
  );
  const others = participants.filter(
    (p) => p.user?.id !== currentUserId
  );

  const commitMap = new Map(commits.map((c) => [c.id, c]));

  // Walk ancestors of a commit to build a set of all ancestor IDs
  function ancestors(commitId: string): Set<string> {
    const visited = new Set<string>();
    let cur = commitId;
    while (cur) {
      visited.add(cur);
      const parent = commitMap.get(cur)?.parent?.id;
      if (!parent || visited.has(parent)) break;
      cur = parent;
    }
    return visited;
  }

  const myAncestors = myHeadCommitId ? ancestors(myHeadCommitId) : new Set<string>();

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Participants
      </div>

      {me && (
        <div className="flex items-center justify-between py-1">
           <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: colorMap?.get(me.id) ?? "var(--color-muted-foreground)" }}
            />
            <span
              className={`text-sm ${me.headCommitId && onSelectVersion ? "cursor-pointer hover:text-accent transition-colors" : ""}`}
              onClick={() => me.headCommitId && onSelectVersion?.(me.headCommitId)}
            >You</span>
            <Badge variant="secondary" className="text-[10px]">
              {me.role}
            </Badge>
          </div>
        </div>
      )}

      {others.length > 0 && <Separator />}

      {others.map((p) => {
        const theirHead = p.headCommitId;
        const sameCommit = myHeadCommitId && theirHead && myHeadCommitId === theirHead;

        // Determine relationship by walking the DAG
        let status: "agreement" | "has-notes" | "yet-to-approve" | "diverged" | "unknown" = "unknown";
        if (sameCommit) {
          status = "agreement";
        } else if (myHeadCommitId && theirHead) {
          const theirAncestors = ancestors(theirHead);
          const theyDescendFromMe = theirAncestors.has(myHeadCommitId);
          const iDescendFromThem = myAncestors.has(theirHead);

          if (theyDescendFromMe) {
            status = "has-notes"; // they're ahead of me
          } else if (iDescendFromThem) {
            status = "yet-to-approve"; // they're behind me
          } else {
            status = "diverged"; // parallel branches
          }
        }

        return (
          <div key={p.id} className="flex items-center justify-between gap-2 py-1">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: colorMap?.get(p.id) ?? "var(--color-muted-foreground)" }}
              />
              <span
                className={`text-sm truncate ${p.headCommitId && onSelectVersion ? "cursor-pointer hover:text-accent transition-colors" : ""}`}
                title={p.email || undefined}
                onClick={() => p.headCommitId && onSelectVersion?.(p.headCommitId)}
              >{displayName(p.email, p.user?.id)}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {p.role}
              </Badge>
            </div>

            {status === "has-notes" && (
              <Link href={`/app/contract/${contractId}/compare/${p.id}`}>
                <Button variant="outline" size="sm" className="text-xs h-7 whitespace-nowrap border-orange-500/50 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10">
                  has notes
                </Button>
              </Link>
            )}

            {status === "diverged" && (
              <Link href={`/app/contract/${contractId}/compare/${p.id}`}>
                <Button variant="outline" size="sm" className="text-xs h-7 whitespace-nowrap border-orange-500/50 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10">
                  resolve conflicts
                </Button>
              </Link>
            )}

            {status === "yet-to-approve" && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">yet to approve</span>
            )}

            {status === "agreement" && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">in agreement</span>
            )}
          </div>
        );
      })}

      {others.length === 0 && (
        <p className="text-xs text-muted-foreground">No other participants yet.</p>
      )}
    </div>
  );
}
