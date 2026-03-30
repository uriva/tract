"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { id } from "@instantdb/react";
import { Button } from "@/components/ui/button";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { DiffViewer } from "@/components/diff-viewer";

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

  async function handleApprove(
    newContent: string,
    approvedCount: number,
    totalCount: number
  ) {
    if (!user || !myParticipant || !myHead) return;
    setApplying(true);

    const newCommitId = id();
    const message =
      approvedCount === totalCount
        ? `Accept all changes from ${theirParticipant?.email?.split("@")[0]}`
        : `Accept ${approvedCount}/${totalCount} changes from ${theirParticipant?.email?.split("@")[0]}`;

    await db.transact([
      db.tx.commits[newCommitId]
        .update({
          content: newContent,
          message,
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

  if (isLoading || !contract) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
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
            Your version vs. {theirParticipant.email.split("@")[0]}&apos;s version
          </p>
        </div>
      </div>

      {/* Version info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-xs text-muted-foreground">Your version</div>
          <div className="text-xs font-mono mt-1">{myHead.id.slice(0, 7)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{myHead.message}</div>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-xs text-muted-foreground">
            {theirParticipant.email.split("@")[0]}&apos;s version
          </div>
          <div className="text-xs font-mono mt-1">{theirHead.id.slice(0, 7)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{theirHead.message}</div>
        </div>
      </div>

      {/* Diff viewer */}
      <DiffViewer
        myContent={myHead.content}
        theirContent={theirHead.content}
        theirEmail={theirParticipant.email.split("@")[0]}
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
