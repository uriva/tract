"use client";

import { useEffect, useState } from "react";

// Animated commit DAG showing diverge → converge flow
// Nodes appear sequentially, paths draw in, participant labels fade in

type Node = {
  id: string;
  x: number;
  y: number;
  label?: string;
  color: string;
  delay: number; // ms before appearing
};

type Edge = {
  from: string;
  to: string;
  delay: number;
};

type Pointer = {
  label: string;
  nodeId: string;
  side: "left" | "right";
  delay: number;
  color: string;
};

const NODES: Node[] = [
  // Shared root
  { id: "c1", x: 200, y: 50, label: "Draft", color: "var(--color-foreground)", delay: 300 },
  // Shared second
  { id: "c2", x: 200, y: 130, label: "Terms added", color: "var(--color-foreground)", delay: 700 },
  // Branch A (left) — Alice edits
  { id: "a1", x: 105, y: 225, label: "Payment clause", color: "var(--color-accent)", delay: 1300 },
  { id: "a2", x: 105, y: 320, label: "Liability cap", color: "var(--color-accent)", delay: 1800 },
  // Branch B (right) — Bob edits
  { id: "b1", x: 295, y: 250, label: "IP section", color: "var(--color-muted-foreground)", delay: 1500 },
  // Converge — agreed version
  { id: "m1", x: 200, y: 425, label: "Agreed", color: "var(--color-foreground)", delay: 2600 },
];

const EDGES: Edge[] = [
  { from: "c1", to: "c2", delay: 500 },
  { from: "c2", to: "a1", delay: 1000 },
  { from: "c2", to: "b1", delay: 1200 },
  { from: "a1", to: "a2", delay: 1500 },
  { from: "a2", to: "m1", delay: 2200 },
  { from: "b1", to: "m1", delay: 2400 },
];

const POINTERS: Pointer[] = [
  { label: "alice", nodeId: "a2", side: "left", delay: 2000, color: "var(--color-accent)" },
  { label: "bob", nodeId: "b1", side: "right", delay: 1700, color: "var(--color-muted-foreground)" },
  // After merge both point to agreed
  { label: "alice", nodeId: "m1", side: "left", delay: 3200, color: "var(--color-accent)" },
  { label: "bob", nodeId: "m1", side: "right", delay: 3400, color: "var(--color-muted-foreground)" },
];

function nodeById(id: string) {
  return NODES.find((n) => n.id === id)!;
}

export function CommitAnimation() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf: number;
    const TOTAL = 4200; // total animation duration
    const tick = () => {
      const t = performance.now() - start;
      setElapsed(Math.min(t, TOTAL));
      if (t < TOTAL) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Which pointers are currently active (latest per label)
  const activePointers: Record<string, Pointer> = {};
  for (const p of POINTERS) {
    if (elapsed >= p.delay) {
      activePointers[p.label] = p;
    }
  }

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox="0 0 400 500"
        className="w-full max-w-[480px] h-auto"
        aria-label="Animated commit graph showing two branches diverging and converging"
      >
        {/* Edges */}
        {EDGES.map((edge) => {
          const from = nodeById(edge.from);
          const to = nodeById(edge.to);
          const visible = elapsed >= edge.delay;
          if (!visible) return null;

          const progress = Math.min((elapsed - edge.delay) / 400, 1);
          const cx = (from.x + to.x) / 2;
          const cy = (from.y + to.y) / 2;
          const path = `M ${from.x} ${from.y} Q ${cx} ${from.y + (to.y - from.y) * 0.3} ${to.x} ${to.y}`;

          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={path}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={2}
              strokeDasharray={200}
              strokeDashoffset={200 * (1 - progress)}
              className="transition-none"
            />
          );
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const visible = elapsed >= node.delay;
          if (!visible) return null;

          const age = elapsed - node.delay;
          const scale = Math.min(age / 200, 1);
          const opacity = Math.min(age / 150, 1);
          const isMerge = node.id === "m1";
          const r = isMerge ? 9 : 7;

          return (
            <g key={node.id} opacity={opacity}>
              <circle
                cx={node.x}
                cy={node.y}
                r={r * scale}
                fill={node.color}
                stroke="var(--color-background)"
                strokeWidth={2.5}
              />
              {node.label && (
                <text
                  x={node.x}
                  y={node.y - r - 8}
                  textAnchor="middle"
                  fontSize={14}
                  className="fill-muted-foreground"
                  style={{ fontFamily: "var(--font-geist-mono), monospace", opacity: Math.min((age - 100) / 200, 1) }}
                >
                  {node.label}
                </text>
              )}
              {/* Agreed badge */}
              {isMerge && age > 300 && (
                <text
                  x={node.x}
                  y={node.y + 28}
                  textAnchor="middle"
                  fontSize={13}
                  className="font-medium"
                  style={{
                    fill: "var(--color-accent)",
                    fontFamily: "var(--font-sans)",
                    opacity: Math.min((age - 300) / 300, 1),
                  }}
                >
                  consensus
                </text>
              )}
            </g>
          );
        })}

        {/* Participant pointers */}
        {Object.values(activePointers).map((ptr) => {
          const node = nodeById(ptr.nodeId);
          const age = elapsed - ptr.delay;
          const opacity = Math.min(age / 300, 1);
          const xOff = ptr.side === "left" ? -65 : 65;
          const tx = node.x + xOff;

          return (
            <g key={`${ptr.label}-${ptr.nodeId}`} opacity={opacity}>
              {/* Line from label to node */}
              <line
                x1={tx + (ptr.side === "left" ? 24 : -24)}
                y1={node.y}
                x2={node.x + (ptr.side === "left" ? -10 : 10)}
                y2={node.y}
                stroke={ptr.color}
                strokeWidth={1}
                strokeDasharray="3 2"
                opacity={0.5}
              />
              {/* Label */}
              <text
                x={tx}
                y={node.y + 4.5}
                textAnchor="middle"
                fontSize={14}
                className="font-medium"
                style={{
                  fill: ptr.color,
                  fontFamily: "var(--font-sans)",
                }}
              >
                {ptr.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
