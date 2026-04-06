"use client";

import { useMemo } from "react";
import { computeLineDiffs, pairWordDiffs, type WordSegment } from "@/lib/diff";

interface InlineDiffViewProps {
  baseContent: string;
  compareContent: string;
}

function WordSegments({ segments }: { segments: WordSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "changed" ? (
          <span key={i} className="diff-word-changed">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

export function InlineDiffView({
  baseContent,
  compareContent,
}: InlineDiffViewProps) {
  const { diffs, hasChanges } = useMemo(
    () => computeLineDiffs(baseContent, compareContent),
    [baseContent, compareContent],
  );

  const wordSegments = useMemo(() => pairWordDiffs(diffs), [diffs]);

  if (!hasChanges) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No differences from your version.
      </div>
    );
  }

  return (
    <div className="font-mono text-sm" dir="auto">
      {diffs.map((diff, i) => {
        if (diff.type === "unchanged") {
          return (
            <div key={i} className="flex items-stretch text-xs leading-6">
              <div className="w-12 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">
                {diff.lineNumber}
              </div>
              <div className="flex-1 px-3 whitespace-pre-wrap break-all">
                {diff.value || "\u00A0"}
              </div>
            </div>
          );
        }

        const isAdded = diff.type === "added";
        const segments = wordSegments.get(i);

        return (
          <div
            key={i}
            className={`flex items-stretch text-xs leading-6 ${
              isAdded ? "diff-line-added" : "diff-line-removed"
            }`}
          >
            <div className="w-12 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">
              {diff.lineNumber}
            </div>
            <div className="w-5 shrink-0 text-center select-none font-semibold">
              <span
                className={
                  isAdded ? "text-diff-added-fg" : "text-diff-removed-fg"
                }
              >
                {isAdded ? "+" : "−"}
              </span>
            </div>
            <div
              className={`flex-1 px-3 whitespace-pre-wrap break-all ${
                isAdded ? "diff-text-added" : "diff-text-removed"
              }`}
            >
              {segments ? (
                <WordSegments segments={segments} />
              ) : (
                diff.value || "\u00A0"
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
