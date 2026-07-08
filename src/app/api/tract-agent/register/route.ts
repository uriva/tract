import { NextResponse } from "next/server";
import { callPrompt2bot, prompt2botSecret } from "@/lib/tract-agent/config";
import { remoteToolDescriptors } from "@/lib/tract-agent/tools";
import { tractPrompt } from "@/lib/tract-agent/prompt";

/**
 * Registers the Tract agent's prompt and remote tools with prompt2bot. Run this
 * once after deploying (and whenever the prompt or tool set changes):
 *   curl -X POST https://<app>/api/tract-agent/register
 */
export async function POST() {
  if (!prompt2botSecret()) {
    return NextResponse.json(
      { error: "PROMPT2BOT_SECRET not configured" },
      { status: 500 },
    );
  }

  await callPrompt2bot("set-prompt", { prompt: tractPrompt });
  await callPrompt2bot("set-custom-tools", { tools: remoteToolDescriptors() });

  return NextResponse.json({
    success: true,
    tools: remoteToolDescriptors().map((t) => t.name),
  });
}
