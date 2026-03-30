import { describe, it, expect } from "vitest";
import { buildLayout, type LayoutCommit } from "./commit-layout";

describe("buildLayout", () => {
  it("returns empty array for no commits", () => {
    expect(buildLayout([])).toEqual([]);
  });

  it("handles a single commit", () => {
    const commits: LayoutCommit[] = [
      { id: "root", createdAt: 1 },
    ];
    const layout = buildLayout(commits);
    expect(layout).toHaveLength(1);
    expect(layout[0].commit.id).toBe("root");
    expect(layout[0].row).toBe(0);
    expect(layout[0].parentRow).toBeUndefined();
  });

  it("handles a linear chain (newest first)", () => {
    const commits: LayoutCommit[] = [
      { id: "root", createdAt: 1 },
      { id: "A1", createdAt: 2, parent: { id: "root" } },
      { id: "A2", createdAt: 3, parent: { id: "A1" } },
    ];
    const layout = buildLayout(commits);
    // Should be topologically sorted: A2 (tip, newest) → A1 → root
    expect(layout.map((n) => n.commit.id)).toEqual(["A2", "A1", "root"]);
    // All on lane 0
    expect(layout.every((n) => n.lane === 0)).toBe(true);
  });

  /**
   * BUG REPRODUCTION: When two branches diverge from the same root,
   * the old algorithm greedily placed the root with the first tip's walk.
   * This caused the second branch's commits to appear *after* the root,
   * making parent→child lines point upward (child row > parent row).
   *
   * Scenario:
   *   root (t=1)
   *   ├── A1 (t=2) → A2 (t=3) → A3 (t=4)   (owner's branch)
   *   └── B  (t=5)                             (amit's branch)
   *
   * Tips sorted newest-first: [B, A3]
   *
   * OLD (BUGGY): B walk → B, root (greedily takes root); A3 walk → A3, A2, A1
   *   sorted = [B, root, A3, A2, A1]
   *   root is at row 1, but A1 (child of root) is at row 4 → line points UP ✗
   *
   * FIXED: B walk → B, then hits root which still has remaining children → defers.
   *   A3 walk → A3, A2, A1, then root (remaining=0 now) → root
   *   sorted = [B, A3, A2, A1, root]
   *   All parent lines point downward ✓
   */
  it("places fork-point commits after all child branches (no upward lines)", () => {
    const commits: LayoutCommit[] = [
      { id: "root", createdAt: 1 },
      { id: "A1", createdAt: 2, parent: { id: "root" } },
      { id: "A2", createdAt: 3, parent: { id: "A1" } },
      { id: "A3", createdAt: 4, parent: { id: "A2" } },
      { id: "B", createdAt: 5, parent: { id: "root" } },
    ];

    const layout = buildLayout(commits);
    const rowOf = new Map(layout.map((n) => [n.commit.id, n.row]));

    // Every commit with a parent must have parentRow > its own row
    // (parent appears below child in the list, meaning lines go downward)
    for (const node of layout) {
      if (node.parentRow !== undefined) {
        expect(
          node.parentRow,
          `${node.commit.id} (row ${node.row}) → parent at row ${node.parentRow} should be below`,
        ).toBeGreaterThan(node.row);
      }
    }

    // Root must come last (after all branches)
    expect(layout[layout.length - 1].commit.id).toBe("root");
  });

  it("handles three branches diverging from the same commit", () => {
    const commits: LayoutCommit[] = [
      { id: "root", createdAt: 1 },
      { id: "A", createdAt: 2, parent: { id: "root" } },
      { id: "B", createdAt: 3, parent: { id: "root" } },
      { id: "C", createdAt: 4, parent: { id: "root" } },
    ];

    const layout = buildLayout(commits);

    // All parent lines should go downward
    for (const node of layout) {
      if (node.parentRow !== undefined) {
        expect(
          node.parentRow,
          `${node.commit.id} (row ${node.row}) → parent at row ${node.parentRow}`,
        ).toBeGreaterThan(node.row);
      }
    }

    // Root must be last
    expect(layout[layout.length - 1].commit.id).toBe("root");
  });

  it("handles a diamond merge scenario (mid-graph fork point)", () => {
    // fork (t=1) → A (t=2) and B (t=3), both merge into merge (t=4)
    // Actually in our git-like DAG each commit has one parent, so let's
    // do: root → fork → A → tipA, and fork → B → tipB
    const commits: LayoutCommit[] = [
      { id: "root", createdAt: 1 },
      { id: "fork", createdAt: 2, parent: { id: "root" } },
      { id: "A", createdAt: 3, parent: { id: "fork" } },
      { id: "B", createdAt: 4, parent: { id: "fork" } },
      { id: "tipA", createdAt: 5, parent: { id: "A" } },
      { id: "tipB", createdAt: 6, parent: { id: "B" } },
    ];

    const layout = buildLayout(commits);

    // All parent lines go downward
    for (const node of layout) {
      if (node.parentRow !== undefined) {
        expect(
          node.parentRow,
          `${node.commit.id} (row ${node.row}) → parent at row ${node.parentRow}`,
        ).toBeGreaterThan(node.row);
      }
    }

    // fork must come after both tipA→A and tipB→B branches
    const rowOf = new Map(layout.map((n) => [n.commit.id, n.row]));
    expect(rowOf.get("fork")!).toBeGreaterThan(rowOf.get("A")!);
    expect(rowOf.get("fork")!).toBeGreaterThan(rowOf.get("B")!);
  });

  it("assigns different lanes to diverging branches", () => {
    const commits: LayoutCommit[] = [
      { id: "root", createdAt: 1 },
      { id: "A", createdAt: 2, parent: { id: "root" } },
      { id: "B", createdAt: 3, parent: { id: "root" } },
    ];

    const layout = buildLayout(commits);
    const lanes = new Map(layout.map((n) => [n.commit.id, n.lane]));

    // A and B should be on different lanes since they diverge
    expect(lanes.get("A")).not.toBe(lanes.get("B"));
  });
});
