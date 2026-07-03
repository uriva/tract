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

  const hunkInfo = useMemo(() => {
    const hunkStart = new Map<number, number>();
    const hunkEnd = new Map<number, number>();
    const isFirstInHunk = new Set<number>();

    let currentStart = -1;
    for (let i = 0; i < diffs.length; i++) {
      if (diffs[i].type !== "unchanged") {
        if (currentStart === -1) {
          currentStart = i;
          isFirstInHunk.add(i);
        }
        hunkStart.set(i, currentStart);
      } else {
        if (currentStart !== -1) {
          for (let k = currentStart; k < i; k++) {
            hunkEnd.set(k, i - 1);
          }
          currentStart = -1;
        }
      }
    }
    if (currentStart !== -1) {
      for (let k = currentStart; k < diffs.length; k++) {
        hunkEnd.set(k, diffs.length - 1);
      }
    }

    return { hunkStart, hunkEnd, isFirstInHunk };
  }, [diffs]);

  const [approved, setApproved] = useState<Set<number>>(new Set());

  const totalHunkCount = hunkInfo.isFirstInHunk.size;

  const approvedHunkCount = useMemo(() => {
    let count = 0;
    for (const startIndex of hunkInfo.isFirstInHunk) {
      if (approved.has(startIndex)) {
        count++;
      }
    }
    return count;
  }, [approved, hunkInfo.isFirstInHunk]);

  function toggleHunk(index: number) {
    const start = hunkInfo.hunkStart.get(index);
    const end = hunkInfo.hunkEnd.get(index);
    if (start === undefined || end === undefined) return;

    setApproved((prev) => {
      const next = new Set(prev);
      let allApproved = true;
      for (let k = start; k <= end; k++) {
        if (!next.has(k)) {
          allApproved = false;
          break;
        }
      }

      if (allApproved) {
        for (let k = start; k <= end; k++) {
          next.delete(k);
        }
      } else {
        for (let k = start; k <= end; k++) {
          next.add(k);
        }
      }
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
    onApprove(newContent, approvedHunkCount, totalHunkCount);
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
            {totalHunkCount} change{totalHunkCount !== 1 ? "s" : ""} &middot;{" "}
            {approvedHunkCount} selected
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
          disabled={approvedHunkCount === 0 || applying}
        >
          {applying
            ? "Applying..."
            : `Apply ${approvedHunkCount} change${approvedHunkCount !== 1 ? "s" : ""}`}
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
              onToggle={toggleHunk}
              wordSegments={wordSegments.get(i)}
              isFirstInHunk={hunkInfo.isFirstInHunk.has(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface DiffLineProps {
  diff: LineDiff;
  index: number;
  isApproved: boolean;
  onToggle: (index: number) => void;
  wordSegments?: WordSegment[];
  isFirstInHunk: boolean;
}

function DiffLine({
  diff,
  index,
  isApproved,
  onToggle,
  wordSegments,
  isFirstInHunk,
}: DiffLineProps) {
  if (diff.type === "unchanged") {
    return (
      <div className="flex items-stretch text-xs leading-6">
        <div className="w-8 shrink-0" />
        <div className="w-12 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">
          {diff.lineNumber}
        </div>
        <div className="flex-1 px-3 whitespace-pre-wrap break-all" dir="auto">
          {diff.value || "\u00A0"}
        </div>
      </div>
    );
  }

  const isAdded = diff.type === "added";
  const isPaired = !!wordSegments;

  return (
    <div
      className={`flex items-stretch text-xs leading-6 ${
        isAdded ? "diff-line-added" : "diff-line-removed"
      }`}
    >
      <div className="w-8 shrink-0 flex items-center justify-center">
        {isFirstInHunk && (
          <Checkbox
            checked={isApproved}
            onCheckedChange={() => onToggle(index)}
            className="h-3.5 w-3.5"
          />
        )}
      </div>
      <div className="w-12 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">
        {diff.lineNumber}
      </div>
      <div className="w-5 shrink-0 text-center select-none font-semibold">
        <span className={isAdded ? "text-diff-added-fg" : "text-diff-removed-fg"}>
          {diff.value.trim() === "" ? "" : (isAdded ? "+" : "-")}
        </span>
      </div>
      <div
        className={`flex-1 px-3 whitespace-pre-wrap break-all ${
          isAdded
            ? isPaired ? "diff-text-added-paired" : "diff-text-added"
            : isPaired ? "diff-text-removed-paired" : "diff-text-removed"
        }`}
        dir="auto"
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
