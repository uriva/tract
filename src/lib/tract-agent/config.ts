import { init } from "@instantdb/admin";
import schema from "../../../instant.schema";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID?.trim() ?? "";
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN?.trim() ?? "";

export const adminDb = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema,
});

/** prompt2bot API gateway. All calls are POST { endpoint, payload }. */
export const PROMPT2BOT_API = "https://api.prompt2bot.com/api";

/**
 * Webhook secret of the Tract bot on prompt2bot. Used both to authenticate our
 * outbound API calls (create-remote-task / set-prompt / set-custom-tools) and to
 * verify inbound signed tool requests from the bot.
 */
export const prompt2botSecret = () =>
  process.env.PROMPT2BOT_SECRET?.trim() ?? "";

/** ID of the Tract bot on prompt2bot. */
export const tractBotId = () => process.env.TRACT_BOT_ID?.trim() ?? "";

/** Production base URL of the Tract deployment. */
export const PRODUCTION_URL = "https://tract-five.vercel.app";

/**
 * Public base URL of this deployment, used to build the absolute HTTPS URLs the
 * bot POSTs to when invoking a tool. Prefer an explicit APP_URL override, then
 * the known production URL. (Preview/localhost cannot receive tool calls from
 * prompt2bot, so we never point the bot at VERCEL_URL preview domains.)
 */
export const appUrl = () =>
  process.env.APP_URL?.trim().replace(/\/$/, "") || PRODUCTION_URL;

/** Path segment under which the per-tool endpoints live. */
export const toolsPath = "tract-tools";

type P2bEndpoint =
  | "create-remote-task"
  | "set-prompt"
  | "set-custom-tools"
  | "inject-reply";

export const callPrompt2bot = async (
  endpoint: P2bEndpoint,
  payload: Record<string, unknown>,
) => {
  const res = await fetch(PROMPT2BOT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      payload: { secret: prompt2botSecret(), ...payload },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(
      `prompt2bot ${endpoint} failed: ${data?.error ?? res.statusText}`,
    );
  }
  return data;
};

/** Stable conversation id for an issue-thread interaction with Tract. */
export const issueConversationId = (contractId: string, issueId: string) =>
  `tract-${contractId}-issue-${issueId}`;

/** Stable conversation id for a contract-level dialog with Tract. */
export const dialogConversationId = (contractId: string, userId: string) =>
  `tract-${contractId}-dialog-${userId}`;

/**
 * Activate the Tract agent on an internal thread (no external network) with a
 * description that gives it the context it needs to act via its tools.
 */
export const activateTract = (conversationId: string, description: string) =>
  callPrompt2bot("create-remote-task", { targetConversationId: conversationId, description });
