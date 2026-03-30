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

interface ParticipantListProps {
  participants: Participant[];
  currentUserId: string;
  contractId: string;
  myHeadCommitId?: string;
}

export function ParticipantList({
  participants,
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

        return (
          <div key={p.id} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
              <span className="text-sm truncate max-w-[140px]">{p.email}</span>
              <Badge variant="secondary" className="text-[10px]">
                {p.role}
              </Badge>
            </div>

            {hasDivergence && (
              <Link href={`/contract/${contractId}/compare/${p.id}`}>
                <Button variant="outline" size="sm" className="text-xs h-7">
                  View diff
                </Button>
              </Link>
            )}

            {!hasDivergence && theirHead && (
              <span className="text-[10px] text-muted-foreground">in sync</span>
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
