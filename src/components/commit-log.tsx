"use client";

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface Commit {
  id: string;
  message: string;
  createdAt: number;
  author?: { id: string; email?: string };
  parent?: { id: string };
}

interface Participant {
  id: string;
  email: string;
  headCommitId?: string;
  user?: { id: string; email?: string };
}

interface CommitLogProps {
  commits: Commit[];
  headCommitId?: string;
  viewingCommitId?: string;
  participants?: Participant[];
  currentUserId?: string;
  onSelectCommit?: (commitId: string) => void;
  onCheckout?: (commitId: string) => void;
}

// Assign colors to participants for DAG markers
const LANE_COLORS = [
  "var(--color-accent)",
  "#6d9eeb",
  "#93c47d",
  "#e69138",
  "#a64d79",
  "#76a5af",
];

interface LayoutNode {
  commit: Commit;
  lane: number;
  row: number;
  parentRow?: number;
  parentLane?: number;
}

function buildLayout(commits: Commit[]): LayoutNode[] {
  if (commits.length === 0) return [];

  const sorted = [...commits].sort((a, b) => b.createdAt - a.createdAt);
  const idToRow = new Map<string, number>();
  sorted.forEach((c, i) => idToRow.set(c.id, i));

  // Find which commits are branch points (have multiple children)
  const childCount = new Map<string, number>();
  for (const c of sorted) {
    const pid = c.parent?.id;
    if (pid) childCount.set(pid, (childCount.get(pid) ?? 0) + 1);
  }

  // Assign lanes: walk top-down, inherit parent's lane for first child,
  // allocate new lane for subsequent children
  const lanes: number[] = new Array(sorted.length).fill(0);
  let nextLane = 1;

  // First pass: find root(s) and assign lane 0
  const parentOf = new Map<string, string>();
  for (const c of sorted) {
    if (c.parent?.id) parentOf.set(c.id, c.parent.id);
  }

  // Track which lane a commit occupies
  const commitLane = new Map<string, number>();

  // Process in reverse chronological order (newest first in display = row 0)
  // But for lane assignment, we go oldest first (bottom up)
  const oldest = [...sorted].reverse();
  for (const c of oldest) {
    const pid = c.parent?.id;
    if (!pid) {
      // Root commit gets lane 0
      commitLane.set(c.id, 0);
    } else {
      const parentLaneVal = commitLane.get(pid) ?? 0;
      const siblings = (childCount.get(pid) ?? 1);
      if (siblings <= 1) {
        // Only child — inherit parent lane
        commitLane.set(c.id, parentLaneVal);
      } else {
        // Multiple children — first gets parent lane, rest get new lanes
        if (!commitLane.has(c.id)) {
          // Check if parent lane is already taken by an earlier sibling
          const parentTaken = [...commitLane.entries()].some(
            ([id, l]) => l === parentLaneVal && parentOf.get(id) === pid && id !== c.id
          );
          if (parentTaken) {
            commitLane.set(c.id, nextLane++);
          } else {
            commitLane.set(c.id, parentLaneVal);
          }
        }
      }
    }
  }

  return sorted.map((commit, row) => {
    const lane = commitLane.get(commit.id) ?? 0;
    const pid = commit.parent?.id;
    const parentRow = pid ? idToRow.get(pid) : undefined;
    const parentLane = pid ? commitLane.get(pid) : undefined;
    return { commit, lane, row, parentRow, parentLane };
  });
}

export function CommitLog({
  commits,
  headCommitId,
  viewingCommitId,
  participants = [],
  currentUserId,
  onSelectCommit,
  onCheckout,
}: CommitLogProps) {
  const layout = useMemo(() => buildLayout(commits), [commits]);
  const maxLane = useMemo(
    () => Math.max(0, ...layout.map((n) => n.lane)),
    [layout],
  );

  // Map commitId → participants on that commit
  const commitParticipants = useMemo(() => {
    const map = new Map<string, Participant[]>();
    for (const p of participants) {
      if (p.headCommitId) {
        const arr = map.get(p.headCommitId) ?? [];
        arr.push(p);
        map.set(p.headCommitId, arr);
      }
    }
    return map;
  }, [participants]);

  const ROW_H = 64;
  const LANE_W = 20;
  const DOT_R = 5;
  const graphW = (maxLane + 1) * LANE_W + 12;

  function laneX(lane: number) {
    return 8 + lane * LANE_W;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        History
      </div>

      <ScrollArea className="max-h-[500px]">
        <div className="relative" style={{ minHeight: layout.length * ROW_H }}>
          {/* SVG layer for lines */}
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={graphW}
            height={layout.length * ROW_H}
            style={{ overflow: "visible" }}
          >
            {layout.map((node) => {
              if (node.parentRow === undefined || node.parentLane === undefined)
                return null;

              const x1 = laneX(node.lane);
              const y1 = node.row * ROW_H + ROW_H / 2;
              const x2 = laneX(node.parentLane);
              const y2 = node.parentRow * ROW_H + ROW_H / 2;

              // If same lane, straight line; otherwise curve
              if (node.lane === node.parentLane) {
                return (
                  <line
                    key={`${node.commit.id}-line`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="var(--color-border)"
                    strokeWidth={1.5}
                  />
                );
              }

              // Curved path: go down from child, then curve over to parent lane
              const midY = (y1 + y2) / 2;
              return (
                <path
                  key={`${node.commit.id}-line`}
                  d={`M ${x1} ${y1} L ${x1} ${midY} C ${x1} ${midY + 12}, ${x2} ${midY - 12}, ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Dots */}
            {layout.map((node) => {
              const isHead = node.commit.id === headCommitId;
              const isTractCommit = !node.commit.author;
              const cx = laneX(node.lane);
              const cy = node.row * ROW_H + ROW_H / 2;

              return (
                <circle
                  key={`${node.commit.id}-dot`}
                  cx={cx}
                  cy={cy}
                  r={isHead ? DOT_R + 1 : DOT_R}
                  fill={
                    isHead
                      ? "var(--color-accent)"
                      : isTractCommit
                      ? "#6d9eeb"
                      : "var(--color-muted-foreground)"
                  }
                  stroke="var(--color-background)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {/* Commit labels */}
          {layout.map((node) => {
            const { commit, row } = node;
            const isHead = commit.id === headCommitId;
            const isViewing = commit.id === viewingCommitId;
            const isTract = !commit.author;
            const authorLabel = isTract ? "Tract" : (commit.author?.email?.split("@")[0] ?? "unknown");
            const onThisCommit = commitParticipants.get(commit.id) ?? [];

            return (
              <button
                key={commit.id}
                onClick={() => onSelectCommit?.(commit.id)}
                className={`absolute right-0 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                  isViewing
                    ? "bg-secondary border border-ring/30"
                    : isHead
                    ? "bg-accent/10 border border-accent/20"
                    : "hover:bg-secondary/50 border border-transparent"
                }`}
                style={{
                  top: row * ROW_H + 4,
                  left: graphW + 4,
                  height: ROW_H - 8,
                  width: `calc(100% - ${graphW + 8}px)`,
                }}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {commit.id.slice(0, 7)}
                  </span>
                  {/* Participant markers */}
                  {onThisCommit.map((p, i) => {
                    const isMe = p.user?.id === currentUserId;
                    const label = isMe ? "You" : (p.email.split("@")[0]);
                    return (
                      <span
                        key={p.id}
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `color-mix(in oklch, ${LANE_COLORS[i % LANE_COLORS.length]} 20%, transparent)`,
                          color: LANE_COLORS[i % LANE_COLORS.length],
                        }}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-0.5 text-xs truncate">{commit.message}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground flex items-center gap-1">
                  {isTract && (
                    <span
                      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-bold"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-accent), color-mix(in oklch, var(--color-accent) 60%, #6d9eeb))",
                        color: "white",
                      }}
                    >
                      T
                    </span>
                  )}
                  {authorLabel} &middot; {getTimeAgo(commit.createdAt)}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
