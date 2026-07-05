import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { content, prompt, contractName } = await req.json();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const systemPrompt = `You are Tract, an AI assistant that helps negotiate and draft contracts.
You are given the current content of a contract (in Markdown) and a request from a participant.
Your job is to apply targeted modifications to the contract.
Instead of copying and returning the entire contract text, you MUST send a PATCH. You do this by specifying precise SEARCH and REPLACE blocks in JSON format.

You MUST respond with a JSON object containing the following keys:
1. "replacements" (array of objects): A list of replacement blocks to apply to the contract. Each object must have:
   - "search" (string): The exact block of text from the current contract that you want to change. Be precise and include enough surrounding context to ensure a unique match.
   - "replace" (string): The new text that should replace the search block.
2. "commitMessage" (string): A short, concise commit message (1-2 sentences) summarizing what changed.`;

  const userPrompt = contractName
    ? `Contract: "${contractName}"\n\nCurrent content:\n${content || "(empty)"}\n\nRequest: ${prompt}`
    : `Current content:\n${content || "(empty)"}\n\nRequest: ${prompt}`;

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
    console.error("Gemini API error:", err);
    return NextResponse.json(
      { error: "Failed to generate content" },
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

  const { replacements, commitMessage } = parsedResponse;

  // Apply the replacements to the contract content
  let updatedContractContent = content || "";
  let success = false;

  if (Array.isArray(replacements) && replacements.length > 0) {
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
  }

  if (!success && (content || "").trim()) {
    return NextResponse.json(
      { error: "AI failed to match and apply any search/replace modifications to the contract content" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    content: updatedContractContent,
    message: commitMessage || "AI-suggested changes",
  });
}
