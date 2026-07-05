import { NextRequest, NextResponse } from "next/server";
import { init, id as genId } from "@instantdb/admin";
import schema from "../../../../instant.schema";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID?.trim()!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN?.trim()!;

const adminDb = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { issueId, issueTitle, contractName, contractContent, comments } = await req.json();

  if (!issueId) {
    return NextResponse.json({ error: "issueId is required" }, { status: 400 });
  }

  const systemPrompt = `You are Tract, an AI assistant that helps negotiate and draft contracts.
You are participating in a discussion thread titled "${issueTitle || "Untitled Issue"}" about the contract "${contractName || "Untitled Contract"}".
The current content of the contract is (in Markdown):
---
${contractContent || "(empty)"}
---

Your job is to reply to comments in the thread.
If the user asks you to edit, change, rewrite, fix, or update any part of the contract, you should also perform the requested modification on the contract content.

You MUST respond with a JSON object containing the following keys:
1. "reply" (string): Your helpful, polite, and professional reply comment in the thread. Keep it relatively concise (1-2 paragraphs).
2. "shouldUpdateContract" (boolean): Set this to true if the last comment asks you to make changes, fixes, or edits to the contract content. Otherwise, set it to false.
3. "updatedContractContent" (string): The full updated contract content in Markdown. Leave empty if shouldUpdateContract is false.
4. "commitMessage" (string): A short, concise commit message (1-2 sentences) summarizing what changed in the contract. Leave empty if shouldUpdateContract is false.`;

  // Format comments context
  const commentHistoryStr = (comments || [])
    .map((c: any) => `[${c.author || "Tract"}]: ${c.content}`)
    .join("\n");

  const userPrompt = `Here is the current comment thread on the contract. The last comment mentions you. Please reply to the last comment:

${commentHistoryStr}

Your reply (from "Tract") in JSON format:`;

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error in comment-reply:", err);
      return NextResponse.json(
        { error: "Failed to generate AI comment reply" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const responseJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!responseJsonText.trim()) {
      return NextResponse.json({ error: "Empty response from Gemini" }, { status: 502 });
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseJsonText.trim());
    } catch (parseErr) {
      console.error("Failed to parse JSON response from Gemini:", responseJsonText);
      return NextResponse.json({ error: "Invalid JSON response from AI" }, { status: 502 });
    }

    const { reply, shouldUpdateContract, updatedContractContent, commitMessage } = parsedResponse;
    const replyText = reply || "";

    if (!replyText.trim()) {
      return NextResponse.json({ error: "AI failed to produce a text reply" }, { status: 502 });
    }

    const replyCommentId = genId();
    const transactions: any[] = [
      adminDb.tx.comments[replyCommentId]
        .update({
          content: replyText.trim(),
          createdAt: Date.now(),
        })
        .link({ issue: issueId }),
    ];

    if (shouldUpdateContract && updatedContractContent?.trim()) {
      // Query database to inspect the issue and its associated contract and commit
      const issueResult = await adminDb.query({
        issues: {
          contract: {},
          commit: {
            author: {},
          },
          $: { where: { id: issueId } },
        },
      });

      const issue = issueResult?.issues?.[0];
      if (issue) {
        const contractId = issue.contract?.id;
        const currentCommit = issue.commit;

        if (contractId) {
          // Check if currentCommit exists and has no author (which means it's a Tract commit)
          const isTractCommit = currentCommit && (!currentCommit.author || !currentCommit.author.id);

          if (isTractCommit) {
            // Squash: Overwrite the existing Tract commit with the new content and update its message
            transactions.push(
              adminDb.tx.commits[currentCommit.id].update({
                content: updatedContractContent.trim(),
                message: commitMessage || "AI-suggested changes (updated)",
                createdAt: Date.now(),
              })
            );
            console.log(`Squashing/Updating existing Tract commit: ${currentCommit.id}`);
          } else {
            // Create a brand new followup commit and link it as the child of the current commit
            const newCommitId = genId();
            transactions.push(
              adminDb.tx.commits[newCommitId]
                .update({
                  content: updatedContractContent.trim(),
                  message: commitMessage || "AI-suggested changes",
                  createdAt: Date.now(),
                })
                .link({ contract: contractId }),
            );

            if (currentCommit) {
              transactions[transactions.length - 1] = transactions[transactions.length - 1].link({ parent: currentCommit.id });
            } else {
              // Fallback: if no commit is linked to the issue, find the latest contract commit as parent
              const contractResult = await adminDb.query({
                contracts: {
                  commits: {},
                  $: { where: { id: contractId } },
                },
              });
              const commits = contractResult?.contracts?.[0]?.commits ?? [];
              if (commits.length > 0) {
                commits.sort((a: any, b: any) => b.createdAt - a.createdAt);
                transactions[transactions.length - 1] = transactions[transactions.length - 1].link({ parent: commits[0].id });
              }
            }

            // Link the new commit to the issue
            transactions.push(
              adminDb.tx.issues[issueId].link({ commit: newCommitId })
            );
            console.log(`Created new followup Tract commit: ${newCommitId}`);
          }
        }
      }
    }

    // Execute the transactions in a single atomic batch
    await adminDb.transact(transactions);

    return NextResponse.json({ success: true, replyId: replyCommentId });
  } catch (error) {
    console.error("Error in comment-reply route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
