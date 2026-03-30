"use client";

import { useState, useMemo } from "react";
import { computeLineDiffs, applySelectedChanges, pairWordDiffs, LineDiff, type WordSegment } from "@/lib/diff";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface DiffViewerProps {
  myContent: string;
  theirContent: string;
  theirEmail: string;
  onApprove: (newContent: string, approvedCount: number, totalCount: number) => void;
  applying?: boolean;
}

export function DiffViewer({
  myContent,
  theirContent,
  theirEmail,
  onApprove,
  applying,
}: DiffViewerProps) {
  const { diffs, hasChanges } = useMemo(
    () => computeLineDiffs(myContent, theirContent),
    [myContent, theirContent]
  );

  const wordSegments = useMemo(() => pairWordDiffs(diffs), [diffs]);

  const changedIndices = useMemo(
    () =>
      diffs.reduce<number[]>((acc, d, i) => {
        if (d.type !== "unchanged") acc.push(i);
        return acc;
      }, []),
    [diffs]
  );

  const [approved, setApproved] = useState<Set<number>>(new Set());

  function toggleLine(index: number) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectAll() {
    setApproved(new Set(changedIndices));
  }

  function selectNone() {
    setApproved(new Set());
  }

  function handleApply() {
    const newContent = applySelectedChanges(myContent, theirContent, approved);
    onApprove(newContent, approved.size, changedIndices.length);
  }

  if (!hasChanges) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No differences. You and {theirEmail} are in sync.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {changedIndices.length} change{changedIndices.length !== 1 ? "s" : ""} &middot;{" "}
            {approved.size} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={selectAll}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={selectNone}
          >
            Clear
          </Button>
        </div>

        <Button
          size="sm"
          onClick={handleApply}
          disabled={approved.size === 0 || applying}
        >
          {applying
            ? "Applying..."
            : `Apply ${approved.size} change${approved.size !== 1 ? "s" : ""}`}
        </Button>
      </div>

      {/* Diff lines */}
      <div className="rounded-lg border border-border">
        <div className="font-mono text-sm">
          {diffs.map((diff, i) => (
            <DiffLine
              key={i}
              diff={diff}
              index={i}
              isApproved={approved.has(i)}
              onToggle={toggleLine}
              wordSegments={wordSegments.get(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiffLine({
  diff,
  index,
  isApproved,
  onToggle,
  wordSegments,
}: {
  diff: LineDiff;
  index: number;
  isApproved: boolean;
  onToggle: (index: number) => void;
  wordSegments?: WordSegment[];
}) {
  if (diff.type === "unchanged") {
    return (
      <div className="flex items-stretch text-xs leading-6">
        <div className="w-8 shrink-0" />
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

  return (
    <div
      className={`flex items-stretch text-xs leading-6 ${
        isAdded ? "diff-line-added" : "diff-line-removed"
      }`}
    >
      <div className="w-8 shrink-0 flex items-center justify-center">
        <Checkbox
          checked={isApproved}
          onCheckedChange={() => onToggle(index)}
          className="h-3.5 w-3.5"
        />
      </div>
      <div className="w-12 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">
        {diff.lineNumber}
      </div>
      <div className="w-5 shrink-0 text-center select-none font-semibold">
        <span className={isAdded ? "text-diff-added-fg" : "text-diff-removed-fg"}>
          {isAdded ? "+" : "-"}
        </span>
      </div>
      <div
        className={`flex-1 px-3 whitespace-pre-wrap break-all ${
          isAdded ? "diff-text-added" : "diff-text-removed"
        }`}
      >
        {wordSegments ? (
          wordSegments.map((seg, i) =>
            seg.type === "changed" ? (
              <span key={i} className="diff-word-changed">
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )
        ) : (
          diff.value || "\u00A0"
        )}
      </div>
    </div>
  );
}
