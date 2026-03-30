"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

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
}

interface ParticipantListProps {
  participants: Participant[];
  commits: Commit[];
  currentUserId: string;
  contractId: string;
  myHeadCommitId?: string;
}

export function ParticipantList({
  participants,
  commits,
  currentUserId,
  contractId,
  myHeadCommitId,
}: ParticipantListProps) {
  const me = participants.find(
    (p) => p.user?.id === currentUserId
  );
  const others = participants.filter(
    (p) => p.user?.id !== currentUserId
  );

  const commitMap = new Map(commits.map((c) => [c.id, c]));
  const myCommitTime = myHeadCommitId
    ? commitMap.get(myHeadCommitId)?.createdAt ?? 0
    : 0;

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Participants
      </div>

      {me && (
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-sm">You</span>
            <Badge variant="secondary" className="text-[10px]">
              {me.role}
            </Badge>
          </div>
        </div>
      )}

      {others.length > 0 && <Separator />}

      {others.map((p) => {
        const theirHead = p.headCommitId;
        const hasDivergence = myHeadCommitId && theirHead && myHeadCommitId !== theirHead;
        const theirCommitTime = theirHead
          ? commitMap.get(theirHead)?.createdAt ?? 0
          : 0;
        const theyAreAhead = theirCommitTime > myCommitTime;

        return (
          <div key={p.id} className="flex items-center justify-between gap-2 py-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
              <span className="text-sm truncate">{p.email}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {p.role}
              </Badge>
            </div>

            {hasDivergence && theyAreAhead && (
              <Link href={`/contract/${contractId}/compare/${p.id}`}>
                <Button variant="outline" size="sm" className="text-xs h-7 whitespace-nowrap">
                  has notes
                </Button>
              </Link>
            )}

            {hasDivergence && !theyAreAhead && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">yet to approve</span>
            )}

            {!hasDivergence && theirHead && (
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
