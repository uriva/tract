import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ message: "Update contract" });
  }

  const { oldContent, newContent } = await req.json();

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are writing a short commit message (under 10 words, no quotes, no period) summarizing what changed between two versions of a contract.

Previous version:
${oldContent || "(empty)"}

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
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ message: "Update contract" });
  }

  const data = await res.json();
  const msg =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "Update contract";

  return NextResponse.json({ message: msg });
}
