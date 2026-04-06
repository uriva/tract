import { NextRequest, NextResponse } from "next/server";
import { init } from "@instantdb/admin";
import schema from "../../../../instant.schema";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

const adminDb = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { contractId } = await req.json();
  if (!contractId) {
    return NextResponse.json(
      { error: "contractId is required" },
      { status: 400 },
    );
  }

  // Fetch contract with all commits and participants
  const result = await adminDb.query({
    contracts: {
      commits: { author: {}, parent: {} },
      participants: { user: {} },
      $: { where: { id: contractId } },
    },
  });

  const contract = result?.contracts?.[0];
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // Build context for LLM
  const commits = contract.commits ?? [];
  const participants = contract.participants ?? [];

  // For each participant, walk their ancestry to describe their version
  const commitMap = new Map(commits.map((c: any) => [c.id, c]));

  function getAncestry(headCommitId: string | undefined, limit = 5) {
    const chain: any[] = [];
    let current = headCommitId ? commitMap.get(headCommitId) : null;
    while (current && chain.length < limit) {
      chain.push(current);
      current = current.parent?.id ? commitMap.get(current.parent.id) : null;
    }
    return chain;
  }

  const participantSummaries = participants.map((p: any) => {
    const name =
      p.user?.email?.split("@")[0] ?? p.email?.split("@")[0] ?? "Unknown";
    const ancestry = getAncestry(p.headCommitId);
    const commitDescriptions = ancestry
      .map(
        (c: any) =>
          `- "${c.message}" (by ${c.author?.[0]?.email?.split("@")[0] ?? c.author?.email?.split("@")[0] ?? "Tract"})`,
      )
      .join("\n");
    return `${name} (${p.email ?? "no email"}) — current version: ${p.headCommitId?.slice(0, 7) ?? "none"}\nRecent commits in their version:\n${commitDescriptions || "  (no commits)"}`;
  });

  // Check if all participants are on same commit
  const headIds = new Set(
    participants.map((p: any) => p.headCommitId).filter(Boolean),
  );
  const agreementNote =
    headIds.size === 1 && participants.length >= 2
      ? "All participants are currently on the same version (consensus)."
      : headIds.size > 1
        ? `There are ${headIds.size} different versions among participants.`
        : "";

  const prompt = `Write a brief summary of what's happening with this collaborative document. Focus on the latest events — who did what recently and where things stand now.

Document: "${contract.name}"

Participants and their versions:
${participantSummaries.join("\n\n")}

${agreementNote}

Keep it short and direct. Emphasize recent activity and who made which changes. Use first names (part before @ in emails). Plain text only, no markdown or quotes.`;

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: prompt }] },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Gemini API error:", err);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 502 },
    );
  }

  const data = await res.json();
  const summary =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  if (!summary) {
    return NextResponse.json(
      { error: "Empty response from model" },
      { status: 502 },
    );
  }

  const now = Date.now();

  // Cache summary on the contract
  await adminDb.transact([
    adminDb.tx.contracts[contractId].update({
      summary,
      summaryGeneratedAt: now,
    }),
  ]);

  return NextResponse.json({
    summary,
    generatedAt: now,
    cached: false,
  });
}
