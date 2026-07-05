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

  const { issueId, issueTitle, contractName, contractContent, comments, viewingCommitId, userId } = await req.json();

  if (!issueId) {
    return NextResponse.json({ error: "issueId is required" }, { status: 400 });
  }

  // Pre-fetch the issue details from InstantDB to build rich context
  let issue;
  try {
    const issueResult = await adminDb.query({
      issues: {
        contract: {},
        commit: {
          author: {},
        },
        $: { where: { id: issueId } },
      },
    });
    issue = issueResult?.issues?.[0];
  } catch (err) {
    console.error("Failed to query issue details:", err);
  }

  // Fetch requester's participant and head commit content
  let requesterParticipant = null;
  let requesterHeadContent = "";
  let requesterHeadCommitId = "";
  const contractId = issue?.contract?.id;

  if (contractId && userId) {
    try {
      const participantsQuery = await adminDb.query({
        participants: {
          user: {},
          $: { where: { "contract.id": contractId } },
        },
      });
      requesterParticipant = participantsQuery?.participants?.find(
        (p: any) => p.user?.id === userId
      );

      if (requesterParticipant && requesterParticipant.headCommitId) {
        const requesterHeadResult = await adminDb.query({
          commits: {
            $: { where: { id: requesterParticipant.headCommitId } }
          }
        });
        const requesterHeadCommit = requesterHeadResult?.commits?.[0];
        requesterHeadContent = requesterHeadCommit?.content || "";
        requesterHeadCommitId = requesterHeadCommit?.id || "";
      }
    } catch (err) {
      console.error("Failed to query requester details:", err);
    }
  }

  // Extract inline line numbers and snippets to construct comfortable, inline doc context
  let inlineContext = "";
  if (issue && issue.lineNumber !== undefined && issue.lineNumber !== null) {
    const lines = contractContent ? contractContent.split("\n") : [];
    const lineText = lines[issue.lineNumber - 1];
    inlineContext = `
NOTE ON INLINE CONTEXT: This discussion thread is an INLINE comment specifically referencing line ${issue.lineNumber} (type: ${issue.lineType || "unknown"}) of the contract version shown above.
The original text of line ${issue.lineNumber} is:
\`\`\`
${lineText || "(empty)"}
\`\`\`
If the user asks you to fix, edit, rewrite, or update, focus your modifications precisely on or around this specific line of the contract.`;
  }

  const systemPrompt = `You are Tract, an AI assistant that helps negotiate and draft contracts.
You are participating in a discussion thread titled "${issueTitle || "Untitled Issue"}" about the contract "${contractName || "Untitled Contract"}".

Here are the two possible base versions of the contract you can work with:
1. THREAD VERSION (The version of the contract where this discussion/comment thread is located):
---
${contractContent || "(empty)"}
---

2. REQUESTER'S CURRENT VERSION (The current version of the user who is chatting with you):
---
${requesterHeadContent || contractContent || "(empty)"}
---

${inlineContext}

Your job is to reply to comments in the thread.
If the user asks you to edit, change, rewrite, fix, or update any part of the contract, you should propose precise, targeted changes.
Instead of copying and returning the entire contract text, you MUST propose a follow-up version. You do this by specifying precise SEARCH and REPLACE blocks.
All your contract edits will be created as a "proposed version" in history, allowing the user to review, compare, and manually accept/merge your changes.

You MUST respond with a JSON object containing the following keys:
1. "reply" (string): Your helpful, polite, and professional reply comment in the thread. Keep it relatively concise (1-2 paragraphs).
2. "shouldUpdateContract" (boolean): Set this to true if the last comment asks you to make changes, fixes, or edits to the contract content. Otherwise, set it to false.
3. "baseVersion" (string): Which base version did you apply your patch to? Choose one:
   - "requester": If you patched the Requester's Current Version.
   - "thread": If you patched the Thread Version.
   - "none": If shouldUpdateContract is false.
4. "replacements" (array of objects): A list of replacement blocks to apply to the contract. Each object must have:
   - "search" (string): The exact block of text from your chosen base version that you want to change. Be precise and include enough surrounding lines to ensure a unique match.
   - "replace" (string): The new text that should replace the search block.
   Leave empty if shouldUpdateContract is false.
5. "commitMessage" (string): A short, concise commit message (1-2 sentences) summarizing what changed. Leave empty if shouldUpdateContract is false.`;

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

    const { reply, shouldUpdateContract, baseVersion, replacements, commitMessage } = parsedResponse;
    const replyText = reply || "";

    if (!replyText.trim()) {
      return NextResponse.json({ error: "AI failed to produce a text reply" }, { status: 502 });
    }

    const replyCommentId = genId();
    let finalReplyText = replyText.trim();
    let targetCommitId = "";

    const transactions: any[] = [];

    if (shouldUpdateContract && Array.isArray(replacements) && replacements.length > 0) {
      if (issue && contractId) {
        // Determine which base content we are applying the patch on
        const useRequesterBase = baseVersion === "requester" && requesterHeadContent;
        const baseContent = useRequesterBase ? requesterHeadContent : (contractContent || "");
        const parentCommitId = useRequesterBase ? requesterHeadCommitId : (viewingCommitId || issue.commit?.id);

        let updatedContractContent = baseContent;
        let success = false;

        for (const item of replacements) {
          if (item.search && item.replace !== undefined) {
            const index = updatedContractContent.indexOf(item.search);
            if (index !== -1) {
              updatedContractContent =
                updatedContractContent.slice(0, index) +
                item.replace +
                updatedContractContent.slice(index + item.search.length);
              success = true;
            } else {
              console.warn(`Could not find search block to replace: "${item.search}"`);
            }
          }
        }

        if (success && updatedContractContent?.trim()) {
          const currentCommit = issue.commit;
          const isTractCommit = currentCommit && (!currentCommit.author || !currentCommit.author.id);

          // Squash: we only squash if the active thread commit is a Tract commit
          if (isTractCommit) {
            targetCommitId = currentCommit.id;
            transactions.push(
              adminDb.tx.commits[targetCommitId].update({
                content: updatedContractContent.trim(),
                message: commitMessage || "AI-suggested changes (updated)",
                createdAt: Date.now(),
              })
            );
            console.log(`Squashing/Updating existing Tract commit: ${targetCommitId}`);
          } else {
            targetCommitId = genId();
            let newCommit = adminDb.tx.commits[targetCommitId]
              .update({
                content: updatedContractContent.trim(),
                message: commitMessage || "AI-suggested changes",
                createdAt: Date.now(),
              })
              .link({ contract: contractId });

            if (parentCommitId) {
              newCommit = newCommit.link({ parent: parentCommitId });
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
                newCommit = newCommit.link({ parent: commits[0].id });
              }
            }

            transactions.push(newCommit);

            // Link the new commit to the issue so the thread points to it
            transactions.push(
              adminDb.tx.issues[issueId].link({ commit: targetCommitId })
            );
            console.log(`Created new proposed Tract commit: ${targetCommitId}`);
          }
        }
      }
    }

    if (targetCommitId) {
      finalReplyText += `\n\n(Done in version ${targetCommitId.slice(0, 7)})`;
    }

    // Insert the AI-generated reply comment
    transactions.unshift(
      adminDb.tx.comments[replyCommentId]
        .update({
          content: finalReplyText,
          createdAt: Date.now(),
        })
        .link({ issue: issueId })
    );

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
