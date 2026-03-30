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

  const systemPrompt = `You are Tract, an AI assistant that helps negotiate and draft contracts. You are given the current content of a contract (in Markdown) and a request from a participant. Your job is to return the updated contract content.

Rules:
- Return ONLY the updated markdown content, nothing else
- Do not wrap in code fences
- Preserve the overall structure unless asked to change it
- Make precise, targeted changes based on the request
- If the contract is empty, draft a reasonable starting point based on the request
- Be fair and balanced — do not favor any party
- Use clear, plain language appropriate for contracts`;

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
        maxOutputTokens: 8192,
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
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Generate a short commit message
  const msgRes = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Summarize this contract edit request in under 10 words for a commit message. No quotes, no period. Request: "${prompt}"`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 50,
      },
    }),
  });

  let commitMessage = "Tract: AI-suggested changes";
  if (msgRes.ok) {
    const msgData = await msgRes.json();
    const msg =
      msgData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (msg) commitMessage = `Tract: ${msg}`;
  }

  return NextResponse.json({ content: text, message: commitMessage });
}
