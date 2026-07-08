import { NextRequest, NextResponse } from "next/server";
import { prompt2botSecret } from "@/lib/tract-agent/config";
import { extractSignedParams } from "@/lib/tract-agent/signing";
import { findTool } from "@/lib/tract-agent/tools";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> },
) {
  const secret = prompt2botSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "PROMPT2BOT_SECRET not configured" },
      { status: 500 },
    );
  }

  const { tool: toolName } = await params;
  const tool = findTool(toolName);
  if (!tool) {
    return NextResponse.json(
      { error: `Tool not found: ${toolName}` },
      { status: 404 },
    );
  }

  const body = await req.json();

  let meta, toolParams;
  try {
    ({ meta, params: toolParams } = extractSignedParams<
      Record<string, unknown>
    >(secret, body));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  try {
    const result = await tool.handler(toolParams, meta);
    return NextResponse.json(result ?? { success: true });
  } catch (err) {
    console.error(`Tract tool ${toolName} failed:`, err);
    const message = err instanceof Error ? err.message : "Tool error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
