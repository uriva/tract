import { NextRequest, NextResponse } from "next/server";
import {
  activateTract,
  adminDb,
  issueConversationId,
  prompt2botSecret,
} from "@/lib/tract-agent/config";

/**
 * Triggered when a participant @-mentions Tract in an issue discussion thread.
 * Instead of doing a hardcoded search/replace, we activate the Tract agent on
 * prompt2bot and let it decide what to do using its remote tools (read the
 * contract, create a proposed commit, open a pull request, reply in the thread).
 */
export async function POST(req: NextRequest) {
  if (!prompt2botSecret()) {
    return NextResponse.json(
      { error: "PROMPT2BOT_SECRET not configured" },
      { status: 500 },
    );
  }

  const { issueId, userId } = await req.json();
  if (!issueId) {
    return NextResponse.json({ error: "issueId is required" }, { status: 400 });
  }

  // Resolve the contract for this issue so the agent knows where to work.
  const result = await adminDb.query({
    issues: {
      $: { where: { id: issueId } },
      contract: {},
      commit: {},
      creator: {},
    },
  });
  const issue = result?.issues?.[0];
  if (!issue?.contract?.id) {
    return NextResponse.json(
      { error: "Issue or its contract not found" },
      { status: 404 },
    );
  }
  const contractId = issue.contract.id;

  const description =
    `A participant mentioned you in a contract discussion thread.
Contract ID: ${contractId}
Issue (thread) ID: ${issueId}
Issue title: ${issue.title ?? "Untitled"}
${issue.commit?.id ? `The thread is anchored on commit: ${issue.commit.id}` : ""}
${userId ? `The requesting user's ID is: ${userId}` : ""}

Read the contract and the thread, then respond. If they asked for a change to the contract, create a new proposed commit and open a pull request to the affected participant(s), then reply in the thread. If it is just a question, reply in the thread. Never modify anyone's version directly.`;

  await activateTract(issueConversationId(contractId, issueId), description);

  return NextResponse.json({ success: true });
}
