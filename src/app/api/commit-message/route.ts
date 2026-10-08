import { NextRequest, NextResponse } from "next/server";
import { geminiGenText, injectGeminiToken } from "@jsr/uri__ai-utils";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MAX_RETRIES = 3;

async function callGemini(
  oldContent: string,
  newContent: string,
): Promise<{ message: string | null; error: boolean }> {
  const prompt = `You are writing a short commit message (under 10 words, no quotes, no period) summarizing what changed between two versions of a document.

Previous version:
${oldContent}

New version:
${newContent || "(empty)"}

Commit message:`;

  return injectGeminiToken(GEMINI_API_KEY!)(async () => {
    try {
      const text = await (geminiGenText as any)({ tier: "flash" }, prompt);
      return { message: text?.trim() || null, error: false };
    } catch (err) {
      console.error("ai-utils geminiGenText error:", err);
      return { message: null, error: true };
    }
  })();
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
    const { message, error } = await callGemini(oldContent, newContent);
    if (message) return NextResponse.json({ message });
    if (error) break;
    console.warn(`commit-message: empty response, retry ${attempt + 1}/${MAX_RETRIES}`);
  }

  return NextResponse.json(
    { error: "Failed to generate commit description" },
    { status: 502 },
  );
}
