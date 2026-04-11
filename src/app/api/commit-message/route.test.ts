import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env before importing route
vi.stubEnv("GEMINI_API_KEY", "test-key");

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/commit-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function geminiResponse(text: string) {
  return Response.json({
    candidates: [{ content: { parts: [{ text }] } }],
  });
}

function emptyGeminiResponse() {
  return Response.json({ candidates: [] });
}

describe("commit-message route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns generated message for normal diff", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      geminiResponse("Added payment terms section"),
    );

    const res = await POST(makeRequest({
      oldContent: "# Contract\nParty A agrees...",
      newContent: "# Contract\nParty A agrees...\n\n## Payment\nNet 30.",
    }) as any);

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toBe("Added payment terms section");
  });

  it("returns 'Initial draft' for first commit without calling LLM", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await POST(makeRequest({
      oldContent: "",
      newContent: "# My Contract\nSome initial content",
    }) as any);

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toBe("Initial draft");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats whitespace-only oldContent as first commit", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await POST(makeRequest({
      oldContent: "   \n  ",
      newContent: "# Contract",
    }) as any);

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toBe("Initial draft");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 when Gemini returns empty candidates on non-first commit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      emptyGeminiResponse(),
    );

    const res = await POST(makeRequest({
      oldContent: "# Existing content\nSome stuff here",
      newContent: "# Existing content\nSome stuff here\n\n## New section",
    }) as any);

    const data = await res.json();
    expect(res.status).toBe(502);
    expect(data.error).toBe("Empty response from model");
  });

  it("returns 502 when Gemini API returns non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Internal error", { status: 500 }),
    );

    const res = await POST(makeRequest({
      oldContent: "old",
      newContent: "new",
    }) as any);

    const data = await res.json();
    expect(res.status).toBe(502);
    expect(data.error).toBe("Failed to generate commit description");
  });

  it("handles null/undefined oldContent as first commit", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await POST(makeRequest({
      oldContent: null,
      newContent: "# Something",
    }) as any);

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toBe("Initial draft");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
