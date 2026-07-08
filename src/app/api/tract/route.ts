import { NextRequest, NextResponse } from "next/server";
import {
  activateTract,
  adminDb,
  dialogConversationId,
  prompt2botSecret,
} from "@/lib/tract-agent/config";

/**
 * Triggered from the "Ask Tract" dialog. Activates the Tract agent with the
 * participant's free-text request. The agent reads the contract, creates a
 * proposed commit off the requester's head, and opens a pull request back to
 * them for review — it never edits their version directly.
 */
export async function POST(req: NextRequest) {
  if (!prompt2botSecret()) {
    return NextResponse.json(
      { error: "PROMPT2BOT_SECRET not configured" },
      { status: 500 },
    );
  }

  const { contractId, prompt, userId } = await req.json();
  if (!contractId || !prompt || !userId) {
    return NextResponse.json(
      { error: "contractId, prompt and userId are required" },
      { status: 400 },
    );
  }

  // Find the requesting participant + their head commit so the agent has an
  // explicit base to build the proposal on.
  const result = await adminDb.query({
    contracts: {
      $: { where: { id: contractId } },
      participants: { user: {} },
    },
  });
  const contract = result?.contracts?.[0];
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
  const me = (contract.participants ?? []).find(
    (p) => p.user?.id === userId,
  );
  if (!me) {
    return NextResponse.json(
      { error: "Requesting user is not a participant" },
      { status: 403 },
    );
  }

  const description =
    `A participant is asking you to help with their contract via the "Ask Tract" dialog.
Contract ID: ${contractId}
Requesting participant ID: ${me.id}
Requesting user ID: ${userId}
Their current head commit ID: ${me.headCommitId ?? "(none)"}

Their request:
"""
${prompt}
"""

Read the contract and their current version, then create a new proposed commit based on their head commit implementing the request, and open a pull request to this participant so they can review and accept it. Do not modify their version directly.`;

  await activateTract(dialogConversationId(contractId, userId), description);

  return NextResponse.json({ success: true });
}
