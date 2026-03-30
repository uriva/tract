import { diffLines, diffWordsWithSpace, Change } from "diff";

export interface LineDiff {
  type: "added" | "removed" | "unchanged";
  value: string;
  lineNumber: number;
  originalLineNumber?: number;
}

export function computeLineDiffs(
  oldText: string,
  newText: string
): { diffs: LineDiff[]; hasChanges: boolean } {
  const changes: Change[] = diffLines(oldText, newText);
  const diffs: LineDiff[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, "").split("\n");

    for (const line of lines) {
      if (change.added) {
        diffs.push({
          type: "added",
          value: line,
          lineNumber: newLine,
        });
        newLine++;
      } else if (change.removed) {
        diffs.push({
          type: "removed",
          value: line,
          lineNumber: oldLine,
          originalLineNumber: oldLine,
        });
        oldLine++;
      } else {
        diffs.push({
          type: "unchanged",
          value: line,
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

      // Pair them 1:1 as far as both sides go
      const pairCount = Math.min(removedCount, addedCount);
      for (let p = 0; p < pairCount; p++) {
        const ri = removedStart + p;
        const ai = addedStart + p;
        const { removedSegments, addedSegments } = computeWordSegments(
          diffs[ri].value,
          diffs[ai].value,
        );
        segments.set(ri, removedSegments);
        segments.set(ai, addedSegments);
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
  const changes: Change[] = diffLines(baseText, targetText);
  const resultLines: string[] = [];
  let diffIndex = 0;

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, "").split("\n");

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

  return resultLines.join("\n");
}
