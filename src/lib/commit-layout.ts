export interface LayoutCommit {
  id: string;
  createdAt: number;
  parent?: { id: string };
}

export interface VisibilityCommit {
  id: string;
  author?: { id: string } | null;
  parent?: { id: string } | null;
}

/**
 * Filter out "Tract" commits (those with no author) that are not an ancestor
 * of any real user commit (a commit that has an author).
 *
 * Rationale: Tract may create intermediate/proposal commits while working. Such
 * a commit should only appear in the history if a real user commit descends
 * from it (i.e. it became part of a user's actual version lineage). Orphan Tract
 * commits — dead-end proposals nobody built on — are hidden.
 *
 * A commit is visible when either:
 *   - it has an author (a real user commit), or
 *   - it is a (transitive) parent of some authored commit, or
 *   - it is "pinned" (e.g. a participant's current head commit) or a
 *     (transitive) parent of a pinned commit.
 *
 * `pinnedIds` keeps commits that must remain visible even without an author —
 * such as a participant head that points at a Tract proposal — so the history
 * graph stays consistent with the participant markers drawn on it.
 */
export function visibleCommits<T extends VisibilityCommit>(
  commits: T[],
  pinnedIds?: Iterable<string>,
): T[] {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const isAuthored = (c: VisibilityCommit) => Boolean(c.author?.id);

  // A commit is a visibility "seed" if it is authored or explicitly pinned.
  // Every seed and every ancestor of a seed is visible.
  const visible = new Set<string>();
  const markAncestors = (startId: string | undefined) => {
    let id = startId;
    while (id && !visible.has(id)) {
      visible.add(id);
      id = byId.get(id)?.parent?.id;
    }
  };

  for (const c of commits) if (isAuthored(c)) markAncestors(c.id);
  for (const id of pinnedIds ?? []) markAncestors(id);

  return commits.filter((c) => visible.has(c.id));
}

export interface LayoutNode<T extends LayoutCommit = LayoutCommit> {
  commit: T;
  lane: number;
  row: number;
  parentRow?: number;
  parentLane?: number;
}

export function buildLayout<T extends LayoutCommit>(commits: T[]): LayoutNode<T>[] {
  if (commits.length === 0) return [];

  // Build adjacency: parent → children
  const childrenOf = new Map<string, T[]>();
  const commitById = new Map<string, T>();
  const roots: T[] = [];

  for (const c of commits) {
    commitById.set(c.id, c);
    if (!c.parent?.id) {
      roots.push(c);
    } else {
      const arr = childrenOf.get(c.parent.id) ?? [];
      arr.push(c);
      childrenOf.set(c.parent.id, arr);
    }
  }

  // Topological sort: DFS from tips (leaf commits) walking backwards,
  // keeping each branch contiguous. We find all tips (commits with no children),
  // sort tips by newest first, then for each tip walk down to the fork point.
  const hasChildren = new Set<string>();
  for (const c of commits) {
    if (c.parent?.id) hasChildren.add(c.parent.id);
  }
  const tips = commits
    .filter((c) => !hasChildren.has(c.id))
    .sort((a, b) => b.createdAt - a.createdAt);

  // Count how many unvisited children each commit has — we only emit a
  // commit once all branches that descend from it have been fully walked.
  const remainingChildren = new Map<string, number>();
  for (const c of commits) {
    if (c.parent?.id) {
      remainingChildren.set(
        c.parent.id,
        (remainingChildren.get(c.parent.id) ?? 0) + 1,
      );
    }
  }

  const sorted: T[] = [];
  const visited = new Set<string>();

  for (const tip of tips) {
    let cur: T | undefined = tip;
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);

      // If this commit still has unvisited children from other branches,
      // defer it — another branch walk will pick it up later.
      const remaining = remainingChildren.get(cur.id) ?? 0;
      if (remaining > 0) {
        // Un-mark; we'll visit when the last child branch reaches it.
        visited.delete(cur.id);
        break;
      }

      sorted.push(cur);

      // Decrement the parent's remaining-children counter
      const pid: string | undefined = cur.parent?.id;
      if (pid) {
        remainingChildren.set(pid, (remainingChildren.get(pid) ?? 0) - 1);
      }

      cur = pid ? commitById.get(pid) : undefined;
    }
  }

  // Any remaining commits (shouldn't happen, but safety)
  for (const c of commits) {
    if (!visited.has(c.id)) {
      sorted.push(c);
      visited.add(c.id);
    }
  }

  const idToRow = new Map<string, number>();
  sorted.forEach((c, i) => idToRow.set(c.id, i));

  // Assign lanes: walk in display order (top to bottom).
  // Each tip starts on its own lane. A commit inherits its child's lane
  // unless it's a fork point (multiple children), in which case it takes
  // the lane of the first child encountered.
  const commitLane = new Map<string, number>();
  let nextLane = 0;

  for (const c of sorted) {
    if (!commitLane.has(c.id)) {
      commitLane.set(c.id, nextLane++);
    }
    const myLane = commitLane.get(c.id)!;
    const pid = c.parent?.id;
    if (pid && !commitLane.has(pid)) {
      commitLane.set(pid, myLane);
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
