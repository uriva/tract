import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

const MAX_RETRIES = 3;

function extractMessage(data: any): string | undefined {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

function buildRequestBody(oldContent: string, newContent: string) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are writing a short commit message (under 10 words, no quotes, no period) summarizing what changed between two versions of a document.

Previous version:
${oldContent}

New version:
${newContent || "(empty)"}

Commit message:`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 50,
    },
  };
}

async function callGemini(
  oldContent: string,
  newContent: string,
): Promise<string | null> {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(oldContent, newContent)),
  });

  if (!res.ok) {
    console.error("Gemini API error:", await res.text());
    return null;
  }

  const data = await res.json();
  const msg = extractMessage(data);
  if (!msg) {
    console.error("Gemini empty candidates:", JSON.stringify(data));
  }
  return msg ?? null;
}

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { oldContent, newContent } = await req.json();

  // First commit — no need to call the LLM
  if (!oldContent?.trim()) {
    return NextResponse.json({ message: "Initial draft" });
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const msg = await callGemini(oldContent, newContent);
    if (msg) return NextResponse.json({ message: msg });
    console.warn(`commit-message: empty response, retry ${attempt + 1}/${MAX_RETRIES}`);
  }

  return NextResponse.json(
    { error: "Failed to generate commit description" },
    { status: 502 },
  );
}
