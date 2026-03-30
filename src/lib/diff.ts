import { diffLines, Change } from "diff";

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
