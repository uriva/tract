"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { Button } from "@/components/ui/button";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { DiffViewer } from "@/components/diff-viewer";
import { displayName, normalizeMarkdown } from "@/lib/utils";

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

  const { data, isLoading } = db.useQuery({
    contracts: {
      commits: {
        author: {},
      },
      participants: {
        user: {},
      },
      $: { where: { id: contractId } },
    },
  });

  const contract = data?.contracts?.[0];
  const commits = contract?.commits ?? [];
  const participants = contract?.participants ?? [];

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

    // Partial merge: create a new commit with the selectively merged content.
    const newCommitId = id();
    const message = `Accept ${approvedCount}/${totalCount} changes from ${displayName(theirParticipant?.email, theirParticipant?.user?.id)}`;

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

    setApplying(false);
    router.push(`/app/contract/${contractId}`);
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
            {isTheirVersionLater ? (
              <>
                Your version vs. <span title={theirParticipant.email || undefined}>{displayName(theirParticipant.email, theirParticipant.user?.id)}</span>&apos;s version
              </>
            ) : (
              <>
                <span title={theirParticipant.email || undefined}>{displayName(theirParticipant.email, theirParticipant.user?.id)}</span>&apos;s version vs. Your version
              </>
            )}
          </p>
        </div>
      </div>

      {/* Version info */}
      <div className="grid grid-cols-2 gap-4">
        {isTheirVersionLater ? (
          <>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-xs text-muted-foreground">Your version (earlier)</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono">{myHead.id.slice(0, 7)}</span>
                <span className="text-muted-foreground/30 text-[10px]">&bull;</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(myHead.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{myHead.message}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-xs text-muted-foreground">
                <span title={theirParticipant.email || undefined}>{displayName(theirParticipant.email, theirParticipant.user?.id)}</span>&apos;s version (later)
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono">{theirHead.id.slice(0, 7)}</span>
                <span className="text-muted-foreground/30 text-[10px]">&bull;</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(theirHead.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{theirHead.message}</div>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-xs text-muted-foreground">
                <span title={theirParticipant.email || undefined}>{displayName(theirParticipant.email, theirParticipant.user?.id)}</span>&apos;s version (earlier)
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono">{theirHead.id.slice(0, 7)}</span>
                <span className="text-muted-foreground/30 text-[10px]">&bull;</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(theirHead.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{theirHead.message}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-xs text-muted-foreground">Your version (later)</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono">{myHead.id.slice(0, 7)}</span>
                <span className="text-muted-foreground/30 text-[10px]">&bull;</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(myHead.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{myHead.message}</div>
            </div>
          </>
        )}
      </div>

      {/* Diff viewer */}
      <DiffViewer
        myContent={isTheirVersionLater ? myHead.content : theirHead.content}
        theirContent={isTheirVersionLater ? theirHead.content : myHead.content}
        theirEmail={displayName(theirParticipant.email, theirParticipant.user?.id)}
        onApprove={handleApprove}
        applying={applying}
      />
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
