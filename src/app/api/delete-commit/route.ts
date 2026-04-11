import { init } from "@instantdb/admin";
import schema from "../../../../instant.schema";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN!;

const adminDb = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

export async function POST(req: Request) {
  const { commitId, userId } = await req.json();

  if (!commitId || !userId) {
    return Response.json(
      { error: "Missing commitId or userId" },
      { status: 400 },
    );
  }

  // Fetch the commit with its contract, author, parent, and children
  const result = await adminDb.query({
    commits: {
      contract: {
        participants: { user: {} },
      },
      author: {},
      parent: {},
      children: {},
      $: { where: { id: commitId } },
    },
  });

  const commit = result?.commits?.[0];
  if (!commit) {
    return Response.json({ error: "Commit not found" }, { status: 404 });
  }

  // Must be a leaf commit (no children)
  const children = commit.children ?? [];
  if (children.length > 0) {
    return Response.json(
      { error: "Cannot delete a commit that has children" },
      { status: 400 },
    );
  }

  // User must be a participant of the contract
  const contract = Array.isArray(commit.contract)
    ? commit.contract[0]
    : commit.contract;
  const participants = contract?.participants ?? [];
  const userParticipant = participants.find(
    (p: any) => p.user?.id === userId,
  );
  if (!userParticipant) {
    return Response.json(
      { error: "You are not a participant of this contract" },
      { status: 403 },
    );
  }

  // The commit must be authored by the user, or be a Tract commit (no author)
  const authorId = Array.isArray(commit.author)
    ? commit.author[0]?.id
    : commit.author?.id;
  if (authorId && authorId !== userId) {
    return Response.json(
      { error: "You can only delete your own commits or Tract commits" },
      { status: 403 },
    );
  }

  const parentId = Array.isArray(commit.parent)
    ? commit.parent[0]?.id
    : commit.parent?.id;

  // No other participant may have adopted this commit
  const othersOnThisCommit = participants.filter(
    (p: any) => p.headCommitId === commitId && p.user?.id !== userId,
  );
  if (othersOnThisCommit.length > 0) {
    return Response.json(
      { error: "Another participant has adopted this commit" },
      { status: 400 },
    );
  }

  const txs: any[] = [];

  // If the requesting user's head points here, move to parent
  if (userParticipant.headCommitId === commitId) {
    txs.push(
      adminDb.tx.participants[userParticipant.id].update({
        headCommitId: parentId ?? "",
      }),
    );
  }

  // Delete the commit
  txs.push(adminDb.tx.commits[commitId].delete());

  await adminDb.transact(txs);

  return Response.json({ deleted: true, movedToParent: parentId ?? null });
}
