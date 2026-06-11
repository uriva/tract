import { describe, it, expect } from "vitest";
import { computeLineDiffs, applySelectedChanges } from "./diff";
import { normalizeMarkdown } from "./utils";

describe("normalizeMarkdown", () => {
  it("normalizes consecutive empty lines and trailing spaces while keeping hard breaks", () => {
    const input = "\n\n# Header   \n\n\nSome text with trailing space \nAnother line  \n\n\nLast line\n\n";
    const expected = "# Header\n\nSome text with trailing space\nAnother line  \n\nLast line\n";
    expect(normalizeMarkdown(input)).toBe(expected);
  });

  it("handles empty document correctly", () => {
    expect(normalizeMarkdown("")).toBe("");
    expect(normalizeMarkdown("\n\n\n")).toBe("");
  });
});

describe("diff and applySelectedChanges with trailing newlines", () => {
  it("computes diff and applies changes correctly when target adds trailing newline", () => {
    const baseText = "hello\nworld";
    const targetText = "hello\nworld\n";

    const { diffs, hasChanges } = computeLineDiffs(baseText, targetText);
    expect(hasChanges).toBe(true);

    // Verify diff indices:
    // 0: unchanged "hello"
    // 1: removed "world"
    // 2: added "world"
    expect(diffs).toEqual([
      { type: "unchanged", value: "hello", lineNumber: 1, originalLineNumber: 1 },
      { type: "removed", value: "world", lineNumber: 2, originalLineNumber: 2 },
      { type: "added", value: "world", lineNumber: 2 },
    ]);

    // If we approve index 1 and 2, the change is applied and the trailing newline is added
    const approved = new Set([1, 2]);
    const result = applySelectedChanges(baseText, targetText, approved);
    expect(result).toBe(targetText);

    // If we do not approve, the original base text is preserved
    const noneApproved = new Set<number>();
    const resultNone = applySelectedChanges(baseText, targetText, noneApproved);
    expect(resultNone).toBe(baseText);
  });

  it("computes diff and applies changes correctly when target removes trailing newline", () => {
    const baseText = "hello\nworld\n";
    const targetText = "hello\nworld";

    const { diffs, hasChanges } = computeLineDiffs(baseText, targetText);
    expect(hasChanges).toBe(true);

    // Verify diff indices:
    // 0: unchanged "hello"
    // 1: removed "world"
    // 2: added "world"
    expect(diffs).toEqual([
      { type: "unchanged", value: "hello", lineNumber: 1, originalLineNumber: 1 },
      { type: "removed", value: "world", lineNumber: 2, originalLineNumber: 2 },
      { type: "added", value: "world", lineNumber: 2 },
    ]);

    // If we approve index 1 and 2, the trailing newline is removed
    const approved = new Set([1, 2]);
    const result = applySelectedChanges(baseText, targetText, approved);
    expect(result).toBe(targetText);

    // If we do not approve, the trailing newline is preserved
    const noneApproved = new Set<number>();
    const resultNone = applySelectedChanges(baseText, targetText, noneApproved);
    expect(resultNone).toBe(baseText);
  });
});
