import { NextRequest, NextResponse } from "next/server";
import { callPrompt2bot, prompt2botSecret } from "@/lib/tract-agent/config";
import { remoteToolDescriptors } from "@/lib/tract-agent/tools";
import { tractPrompt } from "@/lib/tract-agent/prompt";

/**
 * Registers the Tract agent's prompt and remote tools with prompt2bot, keeping
 * the bot in sync with the deployed code. Called by CI after each deploy:
 *   curl -X POST https://<app>/api/tract-agent/register \
 *     -H "Authorization: Bearer $PROMPT2BOT_SECRET"
 *
 * Authenticated with the bot's webhook secret so only trusted callers (CI) can
 * reconfigure the bot.
 */
export async function POST(req: NextRequest) {
  const secret = prompt2botSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "PROMPT2BOT_SECRET not configured" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await callPrompt2bot("set-prompt", { prompt: tractPrompt });
  await callPrompt2bot("set-custom-tools", { tools: remoteToolDescriptors() });

  return NextResponse.json({
    success: true,
    tools: remoteToolDescriptors().map((t) => t.name),
  });
}
