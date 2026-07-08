import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Metadata prompt2bot attaches to every signed tool request. Mirrors the
 * `SignedToolRequest` shape from @prompt2bot/client (which is JSR-only, so we
 * reproduce the minimal contract here rather than depend on it).
 */
export interface SignedToolMeta {
  botId: string;
  conversationId: string;
  userId: string;
  network: string;
  timestamp: string;
  nonce: string;
  isGroupChat: boolean;
  toolCallId?: string;
  channel?: { network: string; id: string };
}

export interface SignedToolRequest<T> {
  payload: { meta: SignedToolMeta; params: T };
  signature: string;
}

const MAX_SKEW_MS = 5 * 60_000;

const safeEqualHex = (a: string, b: string) => {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/**
 * Verify a signed tool request from prompt2bot and return its meta + params.
 * Throws on any tampering, stale timestamp, or malformed payload.
 */
export const extractSignedParams = <T>(
  secret: string,
  input: SignedToolRequest<T>,
): { meta: SignedToolMeta; params: T } => {
  if (!input || typeof input !== "object") throw new Error("Bad payload");
  const { payload, signature } = input;
  if (!payload || typeof signature !== "string") {
    throw new Error("Bad payload");
  }

  const expected = createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
  if (!safeEqualHex(expected, signature)) throw new Error("Bad signature");

  const ts = Number(payload.meta?.timestamp);
  if (!Number.isFinite(ts)) throw new Error("Bad timestamp");
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) throw new Error("Stale request");

  if (payload.params === undefined) throw new Error("Missing params");
  return { meta: payload.meta, params: payload.params };
};
