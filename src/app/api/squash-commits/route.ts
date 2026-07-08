import { init } from "@instantdb/admin";
import schema from "../../../../instant.schema";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID?.trim()!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN?.trim()!;

const adminDb = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

/**
 * Squash a maximal linear chain of consecutive commits that are all owned by the
 * requesting user into a single commit.
 *
 * A squashable chain ending at `tipCommitId` is the maximal run
 *   C1 -> C2 -> ... -> Cn (= tip)
 * where, for every commit in the run:
 *   - the author is the requesting user (Tract commits, which have no author,
 *     are NOT included — this only merges commits owned by "me")
 *   - the chain is linear: each intermediate commit has exactly one child, which
 *     is the next commit in the run (no branching)
 *   - no participant head (other than possibly the tip) points at an
 *     intermediate commit, so adopted/shared history is never rewritten
 *
 * The tip's content is kept (it is the latest cumulative snapshot). The tip is
 * reparented to C1's parent (the pre-chain base) and the intermediate commits
 * C1..Cn-1 are deleted. The combined commit message is a concatenation of the
 * squashed commit messages (oldest first).
 */
export async function POST(req: Request) {
  const { tipCommitId, userId } = await req.json();

  if (!tipCommitId || !userId) {
    return Response.json(
      { error: "Missing tipCommitId or userId" },
      { status: 400 },
    );
  }

  // Load the contract that owns this commit, together with all of its commits
  // (with author + parent) and participants.
  const tipResult = await adminDb.query({
    commits: {
      contract: {
        commits: { author: {}, parent: {} },
        participants: { user: {} },
      },
      $: { where: { id: tipCommitId } },
    },
  });

  const tipCommit = tipResult?.commits?.[0];
  if (!tipCommit) {
    return Response.json({ error: "Commit not found" }, { status: 404 });
  }

  const contract = Array.isArray(tipCommit.contract)
    ? tipCommit.contract[0]
    : tipCommit.contract;
  if (!contract) {
    return Response.json({ error: "Contract not found" }, { status: 404 });
  }

  const commits: any[] = contract.commits ?? [];
  const participants: any[] = contract.participants ?? [];

  // Requester must be a participant of the contract.
  const userParticipant = participants.find(
    (p: any) => p.user?.id === userId,
  );
  if (!userParticipant) {
    return Response.json(
      { error: "You are not a participant of this contract" },
      { status: 403 },
    );
  }

  const byId = new Map<string, any>();
  for (const c of commits) byId.set(c.id, c);

  // parentId -> child ids
  const childrenOf = new Map<string, string[]>();
  for (const c of commits) {
    const pid = Array.isArray(c.parent) ? c.parent[0]?.id : c.parent?.id;
    if (pid) {
      const arr = childrenOf.get(pid) ?? [];
      arr.push(c.id);
      childrenOf.set(pid, arr);
    }
  }

  const authorOf = (c: any): string | null =>
    (Array.isArray(c.author) ? c.author[0]?.id : c.author?.id) ?? null;
  const parentOf = (c: any): string | null =>
    (Array.isArray(c.parent) ? c.parent[0]?.id : c.parent?.id) ?? null;

  const tip = byId.get(tipCommitId);
  if (!tip) {
    return Response.json(
      { error: "Commit not part of contract" },
      { status: 404 },
    );
  }

  // The tip must be owned by the requesting user.
  if (authorOf(tip) !== userId) {
    return Response.json(
      { error: "You can only squash your own commits" },
      { status: 403 },
    );
  }

  // Walk up from the tip collecting consecutive commits owned by the user, as
  // long as the chain stays linear and no other participant has adopted an
  // intermediate commit.
  const run: any[] = [tip]; // ordered tip-first; will reverse to oldest-first
  let cur = tip;
  while (true) {
    const parentId = parentOf(cur);
    if (!parentId) break;
    const parent = byId.get(parentId);
    if (!parent) break;
    // Parent must be owned by the same user to be part of the chain.
    if (authorOf(parent) !== userId) break;
    // Parent must have exactly one child (cur) — otherwise it is a branch point
    // and squashing it would rewrite a shared fork.
    const kids = childrenOf.get(parentId) ?? [];
    if (kids.length !== 1) break;
    // The parent becomes an intermediate that will be deleted. No other
    // participant may have adopted it.
    const adoptedByOther = participants.some(
      (p: any) => p.headCommitId === parentId && p.user?.id !== userId,
    );
    if (adoptedByOther) break;
    run.push(parent);
    cur = parent;
  }

  if (run.length < 2) {
    return Response.json(
      { error: "No chain of consecutive commits of yours to squash" },
      { status: 400 },
    );
  }

  // run is tip-first; reorder to oldest-first (C1 .. Cn = tip).
  run.reverse();
  const base = run[0];
  const baseParentId = parentOf(base);
  const intermediates = run.slice(0, -1); // C1..Cn-1 (everything except tip)

  // Combine messages oldest-first, skipping blanks and de-duplicating adjacent
  // identical lines.
  const messages: string[] = [];
  for (const c of run) {
    const msg = (c.message ?? "").trim();
    if (!msg) continue;
    if (messages[messages.length - 1] === msg) continue;
    messages.push(msg);
  }
  const combinedMessage =
    messages.length > 0
      ? messages.join("\n")
      : (tip.message ?? "");

  const txs: any[] = [];

  // Reparent the tip to the pre-chain base. For a to-one link, link() replaces
  // the existing parent association. If there is no base parent (the chain
  // starts at the root), unlink the tip's parent so it becomes the new root.
  const tipTx = adminDb.tx.commits[tip.id].update({ message: combinedMessage });
  if (baseParentId) {
    txs.push(tipTx.link({ parent: baseParentId }));
  } else {
    const tipParentId = parentOf(tip);
    txs.push(
      tipParentId ? tipTx.unlink({ parent: tipParentId }) : tipTx,
    );
  }

  // Move any of the user's own participant heads that point at an intermediate
  // (soon-to-be-deleted) commit onto the surviving tip.
  for (const p of participants) {
    if (
      p.user?.id === userId &&
      intermediates.some((c: any) => c.id === p.headCommitId)
    ) {
      txs.push(
        adminDb.tx.participants[p.id].update({ headCommitId: tip.id }),
      );
    }
  }

  // Delete the intermediate commits.
  for (const c of intermediates) {
    txs.push(adminDb.tx.commits[c.id].delete());
  }

  await adminDb.transact(txs);

  return Response.json({
    squashed: true,
    tipCommitId: tip.id,
    deletedCount: intermediates.length,
    newParentId: baseParentId ?? null,
  });
}
