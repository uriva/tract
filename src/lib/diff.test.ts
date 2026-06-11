import { describe, it, expect } from "vitest";
import { computeLineDiffs, applySelectedChanges } from "./diff";
import { normalizeMarkdown } from "./utils";

describe("normalizeMarkdown", () => {
  it("normalizes consecutive empty lines and trailing spaces while keeping hard breaks", () => {
    const input = "\n\n# Header   \n\n\nSome text with trailing space \nAnother line  \n\n\nLast line\n\n";
    const expected = "# Header\n\nSome text with trailing space\nAnother line  \n\nLast line\n";
    expect(normalizeMarkdown(input)).toBe(expected);
  });

  it("normalizes internal consecutive spaces while preserving indentation", () => {
    const input = "  - List   item  with   multiple   spaces";
    const expected = "  - List item with multiple spaces\n";
    expect(normalizeMarkdown(input)).toBe(expected);
  });

  it("handles empty document correctly", () => {
    expect(normalizeMarkdown("")).toBe("");
    expect(normalizeMarkdown("\n\n\n")).toBe("");
  });
});

describe("diff and applySelectedChanges with normalized whitespace", () => {
  it("ignores trailing newlines and whitespace differences", () => {
    const baseText = "hello\nworld";
    const targetText = "hello\nworld\n";

    const { hasChanges } = computeLineDiffs(baseText, targetText);
    expect(hasChanges).toBe(false);
  });

  it("computes diff and applies changes correctly when actual content changes are present", () => {
    const baseText = "hello\nworld ";
    const targetText = "hello\nworld\npeople";

    const { diffs, hasChanges } = computeLineDiffs(baseText, targetText);
    expect(hasChanges).toBe(true);

    // Verify diff indices:
    // 0: unchanged "hello"
    // 1: unchanged "world" (since trailing spaces are normalized)
    // 2: added "people"
    expect(diffs).toEqual([
      { type: "unchanged", value: "hello", lineNumber: 1, originalLineNumber: 1 },
      { type: "unchanged", value: "world", lineNumber: 2, originalLineNumber: 2 },
      { type: "added", value: "people", lineNumber: 3 },
    ]);

    // If we approve the addition
    const approved = new Set([2]);
    const result = applySelectedChanges(baseText, targetText, approved);
    expect(result).toBe("hello\nworld\npeople\n");
  });
});
