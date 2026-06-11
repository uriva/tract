import { diffLines, diffWordsWithSpace, Change } from "diff";
import { normalizeMarkdown } from "./utils";

export interface LineDiff {
  type: "added" | "removed" | "unchanged";
  value: string;
  lineNumber: number;
  originalLineNumber?: number;
}

interface LineWithEnding {
  value: string;
  hasNewline: boolean;
}

function getLinesWithEnding(value: string): LineWithEnding[] {
  const parts = value.split("\n");
  if (parts.length > 1 && parts[parts.length - 1] === "") {
    return parts.slice(0, -1).map((part) => ({
      value: part,
      hasNewline: true,
    }));
  } else {
    return parts.map((part, index) => ({
      value: part,
      hasNewline: index < parts.length - 1,
    }));
  }
}

export function computeLineDiffs(
  oldText: string,
  newText: string
): { diffs: LineDiff[]; hasChanges: boolean } {
  const changes: Change[] = diffLines(normalizeMarkdown(oldText), normalizeMarkdown(newText));
  const diffs: LineDiff[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const lines = getLinesWithEnding(change.value);

    for (const line of lines) {
      if (change.added) {
        diffs.push({
          type: "added",
          value: line.value,
          lineNumber: newLine,
        });
        newLine++;
      } else if (change.removed) {
        diffs.push({
          type: "removed",
          value: line.value,
          lineNumber: oldLine,
          originalLineNumber: oldLine,
        });
        oldLine++;
      } else {
        diffs.push({
          type: "unchanged",
          value: line.value,
          lineNumber: newLine,
          originalLineNumber: oldLine,
        });
        oldLine++;
        newLine++;
      }
    }
  }

  const hasChanges = diffs.some((d) => d.type !== "unchanged");
  return { diffs, hasChanges };
}

/** A segment of text within a line, with word-level diff info. */
export interface WordSegment {
  text: string;
  type: "equal" | "changed";
}

/**
 * For a pair of removed + added lines, compute word-level diff segments.
 * Returns segments for the removed line and segments for the added line.
 */
export function computeWordSegments(
  removedText: string,
  addedText: string,
): { removedSegments: WordSegment[]; addedSegments: WordSegment[] } {
  const changes = diffWordsWithSpace(removedText, addedText);
  const removedSegments: WordSegment[] = [];
  const addedSegments: WordSegment[] = [];

  for (const change of changes) {
    if (change.added) {
      addedSegments.push({ text: change.value, type: "changed" });
    } else if (change.removed) {
      removedSegments.push({ text: change.value, type: "changed" });
    } else {
      removedSegments.push({ text: change.value, type: "equal" });
      addedSegments.push({ text: change.value, type: "equal" });
    }
  }

  return { removedSegments, addedSegments };
}

function getSimilarity(removedText: string, addedText: string): number {
  const { removedSegments, addedSegments } = computeWordSegments(removedText, addedText);
  let unchangedLength = 0;
  let totalLength = 0;
  for (const seg of removedSegments) {
    if (seg.type === "equal") {
      unchangedLength += seg.text.length;
    }
    totalLength += seg.text.length;
  }
  for (const seg of addedSegments) {
    totalLength += seg.text.length;
  }
  return totalLength > 0 ? (unchangedLength * 2) / totalLength : 0;
}

/**
 * Pair adjacent removed/added lines for word-level diffing.
 * Returns a map from diff index → WordSegment[] for lines that have a pair.
 */
export function pairWordDiffs(diffs: LineDiff[]): Map<number, WordSegment[]> {
  const segments = new Map<number, WordSegment[]>();

  // Find blocks of consecutive removed lines followed by consecutive added lines
  let i = 0;
  while (i < diffs.length) {
    if (diffs[i].type === "removed") {
      const removedStart = i;
      while (i < diffs.length && diffs[i].type === "removed") i++;
      const addedStart = i;
      while (i < diffs.length && diffs[i].type === "added") i++;
      const addedEnd = i;

      const removedCount = addedStart - removedStart;
      const addedCount = addedEnd - addedStart;

      // Extract the indices of removed and added lines
      const R_indices: number[] = [];
      for (let r = removedStart; r < addedStart; r++) {
        R_indices.push(r);
      }
      const A_indices: number[] = [];
      for (let a = addedStart; a < addedEnd; a++) {
        A_indices.push(a);
      }

      // Compute DP alignment between R and A to find optimal pairs
      const M = R_indices.length;
      const N = A_indices.length;
      const dp = Array.from({ length: M + 1 }, () => Array(N + 1).fill(0));
      const parent = Array.from({ length: M + 1 }, () => Array(N + 1).fill(null));

      for (let r = 1; r <= M; r++) {
        for (let a = 1; a <= N; a++) {
          let best = dp[r - 1][a];
          let choice: { type: "skip_r" | "skip_a" | "pair"; sim?: number } = { type: "skip_r" };

          if (dp[r][a - 1] > best) {
            best = dp[r][a - 1];
            choice = { type: "skip_a" };
          }

          const ri = R_indices[r - 1];
          const ai = A_indices[a - 1];
          const sim = getSimilarity(diffs[ri].value, diffs[ai].value);

          if (sim >= 0.3) {
            const scoreWithPair = dp[r - 1][a - 1] + sim;
            if (scoreWithPair > best) {
              best = scoreWithPair;
              choice = { type: "pair" as const, sim };
            }
          }

          dp[r][a] = best;
          parent[r][a] = choice;
        }
      }

      // Reconstruct pairs
      let r_curr = M;
      let a_curr = N;
      while (r_curr > 0 && a_curr > 0) {
        const choice = parent[r_curr][a_curr];
        if (!choice) break;
        if (choice.type === "pair") {
          const ri = R_indices[r_curr - 1];
          const ai = A_indices[a_curr - 1];
          const { removedSegments, addedSegments } = computeWordSegments(
            diffs[ri].value,
            diffs[ai].value
          );
          segments.set(ri, removedSegments);
          segments.set(ai, addedSegments);
          r_curr--;
          a_curr--;
        } else if (choice.type === "skip_r") {
          r_curr--;
        } else {
          a_curr--;
        }
      }
    } else {
      i++;
    }
  }

  return segments;
}

/**
 * Apply selected line changes to produce a new document.
 * Takes the base text, the diffs, and a set of approved diff indices.
 * Returns the merged text.
 */
export function applySelectedChanges(
  baseText: string,
  targetText: string,
  approvedIndices: Set<number>
): string {
  const changes: Change[] = diffLines(normalizeMarkdown(baseText), normalizeMarkdown(targetText));
  const resultLines: LineWithEnding[] = [];
  let diffIndex = 0;

  for (const change of changes) {
    const lines = getLinesWithEnding(change.value);

    for (const line of lines) {
      if (change.added) {
        // Only include added lines if approved
        if (approvedIndices.has(diffIndex)) {
          resultLines.push(line);
        }
        diffIndex++;
      } else if (change.removed) {
        // Keep removed lines unless their removal is approved
        if (!approvedIndices.has(diffIndex)) {
          resultLines.push(line);
        }
        diffIndex++;
      } else {
        // Unchanged lines always stay
        resultLines.push(line);
        diffIndex++;
      }
    }
  }

  return resultLines.map((line) => line.value + (line.hasNewline ? "\n" : "")).join("");
}
