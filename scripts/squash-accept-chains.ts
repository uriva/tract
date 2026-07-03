/**
 * One-off migration: squash existing chains of consecutive "Accept X/Y changes
 * from <name>" commits into a single commit.
 *
 * A squashable chain is a maximal run of consecutive commits C1 -> C2 -> ... -> Cn
 * where, for every commit in the run:
 *   - the message matches: Accept <num>/<num> changes from <name>
 *   - the captured <name> is identical across the whole run
 *   - the author is the same user across the whole run (or all have no author)
 *   - the chain is linear: each commit has exactly one child, which is the next
 *     commit in the run (no branching)
 *   - no participant's headCommitId points at an intermediate commit (C1..Cn-1);
 *     only the tip Cn may be a participant head
 *
 * Result: keep the tip Cn, reparent it to C1's parent, delete C1..Cn-1, and
 * recompute Cn's message counts against C1's parent (the pre-chain baseline).
 * Any participant head pointing at an intermediate commit blocks the squash for
 * that chain (safety), so shared/adopted history is never rewritten.
 *
 * Usage (from the project root):
 *   node --env-file=.env.local scripts/squash-accept-chains.ts          # dry run
 *   node --env-file=.env.local scripts/squash-accept-chains.ts --apply  # execute
 */

import { init } from "@instantdb/admin";
import { diffLines } from "diff";
import schema from "../instant.schema";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID?.trim();
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN?.trim();

if (!APP_ID || !ADMIN_TOKEN) {
  console.error(
    "Missing NEXT_PUBLIC_INSTANT_APP_ID or INSTANT_ADMIN_TOKEN. Run with --env-file=.env.local",
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

// --- copied from src/lib/utils.ts (keep in sync) ---
function normalizeMarkdown(text: string): string {
  if (!text) return "";
  let cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  cleaned = cleaned.replace(/\t/g, "    ");
  cleaned = cleaned.replace(/\u200B/g, "");
  cleaned = cleaned.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");

  const lines = cleaned.split("\n");
  const normalizedLines = lines.map((line) => {
    const trimmedLine = line.trimEnd();
    const isHardBreak =
      line.endsWith("  ") && !line.endsWith("   ") && line.trim() !== "";
    const match = trimmedLine.match(/^(\s*)(.*)$/);
    if (match) {
      const indent = match[1];
      const content = match[2];
      const normalizedContent = content.replace(/ {2,}/g, " ");
      const baseLine = indent + normalizedContent;
      return isHardBreak ? baseLine + "  " : baseLine;
    }
    return trimmedLine;
  });

  const resultLines: string[] = [];
  let isPrevEmpty = false;
  for (const line of normalizedLines) {
    const isEmpty = line === "";
    if (isEmpty) {
      if (!isPrevEmpty) resultLines.push("");
      isPrevEmpty = true;
    } else {
      resultLines.push(line);
      isPrevEmpty = false;
    }
  }
  while (resultLines.length > 0 && resultLines[0] === "") resultLines.shift();
  while (resultLines.length > 0 && resultLines[resultLines.length - 1] === "")
    resultLines.pop();
  return resultLines.length > 0 ? resultLines.join("\n") + "\n" : "";
}

// Count change hunks between two documents (matches diff-viewer semantics).
function countHunks(before: string, after: string): number {
  const changes = diffLines(normalizeMarkdown(before), normalizeMarkdown(after));
  let hunks = 0;
  let inHunk = false;
  for (const c of changes) {
    if (c.added || c.removed) {
      if (!inHunk) {
        hunks++;
        inHunk = true;
      }
    } else {
      inHunk = false;
    }
  }
  return hunks;
}

const ACCEPT_RE = /^Accept \d+\/\d+ changes from (.+)$/;

function acceptFromName(message: string | undefined): string | null {
  if (!message) return null;
  const m = message.match(ACCEPT_RE);
  return m ? m[1] : null;
}

interface Commit {
  id: string;
  content: string;
  message: string;
  createdAt: number;
  parent?: { id: string } | null;
  author?: { id: string } | null;
}

interface Participant {
  id: string;
  headCommitId?: string;
}

interface Contract {
  id: string;
  name: string;
  commits: Commit[];
  participants: Participant[];
}

async function main() {
  const data = await db.query({
    contracts: {
      commits: { author: {}, parent: {} },
      participants: {},
    },
  });

  const contracts = (data.contracts ?? []) as unknown as Contract[];

  const txs: any[] = [];
  let chainsFound = 0;
  let commitsDeleted = 0;

  for (const contract of contracts) {
    const commits = contract.commits ?? [];
    const participants = contract.participants ?? [];

    const byId = new Map<string, Commit>();
    for (const c of commits) byId.set(c.id, c);

    // children map: parentId -> child commit ids
    const childrenOf = new Map<string, string[]>();
    for (const c of commits) {
      const pid = c.parent?.id;
      if (pid) {
        const arr = childrenOf.get(pid) ?? [];
        arr.push(c.id);
        childrenOf.set(pid, arr);
      }
    }

    const headSet = new Set(
      participants
        .map((p) => p.headCommitId)
        .filter((h): h is string => !!h),
    );

    // Walk each commit; identify the start of a squashable run. A run starts at
    // an accept-commit whose parent is NOT an accept from the same name (so we
    // grab maximal runs and don't re-process interior commits).
    const consumed = new Set<string>();

    for (const start of commits) {
      if (consumed.has(start.id)) continue;
      const name = acceptFromName(start.message);
      if (!name) continue;

      const parent = start.parent?.id ? byId.get(start.parent.id) : undefined;
      const parentName = acceptFromName(parent?.message);
      const startAuthor = start.author?.id ?? null;
      // Only begin a run where the parent isn't a same-name accept by same author.
      if (parent && parentName === name && (parent.author?.id ?? null) === startAuthor) {
        continue; // interior commit; will be picked up from the run start
      }

      // Build the maximal linear run of same-name, same-author accepts.
      const run: Commit[] = [start];
      let cur = start;
      while (true) {
        const kids = childrenOf.get(cur.id) ?? [];
        if (kids.length !== 1) break; // branch or leaf -> stop
        const child = byId.get(kids[0]);
        if (!child) break;
        if (acceptFromName(child.message) !== name) break;
        if ((child.author?.id ?? null) !== startAuthor) break;
        run.push(child);
        cur = child;
      }

      if (run.length < 2) continue; // nothing to squash

      // Safety: no participant head may point at an intermediate commit
      // (run[0] .. run[n-2]). The tip (last) is allowed.
      const intermediates = run.slice(0, -1);
      const blocked = intermediates.some((c) => headSet.has(c.id));
      if (blocked) {
        console.log(
          `  [skip] ${contract.name}: chain of ${run.length} blocked (participant head on intermediate commit)`,
        );
        continue;
      }

      const tip = run[run.length - 1];
      const baseId = run[0].parent?.id ?? null;
      const base = baseId ? byId.get(baseId) : undefined;

      // A base is required: it is the pre-chain version the accepts built upon,
      // and the reparent target. Without it we cannot safely collapse.
      if (!baseId || base?.content === undefined) {
        console.log(
          `  [skip] ${contract.name}: chain of ${run.length} has no usable base commit`,
        );
        continue;
      }

      // Recompute the cumulative accepted count against the pre-chain baseline.
      // The original "X/Y" denominators were each measured against a different
      // incremental baseline and cannot be re-summed meaningfully, so we drop
      // the denominator and report the true cumulative number of changes.
      const approved = countHunks(base.content, tip.content);
      const newMessage = `Accept ${approved} change${approved !== 1 ? "s" : ""} from ${name}`;

      for (const c of run) consumed.add(c.id);
      chainsFound++;
      commitsDeleted += run.length - 1;

      console.log(
        `  [squash] ${contract.name}: ${run.length} commits -> 1  (base=${baseId.slice(0, 7)}, tip=${tip.id.slice(0, 7)})`,
      );
      console.log(`           message: "${newMessage}"`);

      if (APPLY) {
        // Reparent tip to base and update its message. For a to-one link,
        // link() replaces the tip's existing parent association.
        txs.push(
          db.tx.commits[tip.id]
            .update({ message: newMessage })
            .link({ parent: baseId }),
        );
        // Delete the first + interior commits (everything except the tip).
        // delete() also removes their associations automatically.
        for (const c of intermediates) {
          txs.push(db.tx.commits[c.id].delete());
        }
      }
    }
  }

  console.log("");
  console.log(
    `Summary: ${chainsFound} chain(s) squashable, ${commitsDeleted} commit(s) would be deleted.`,
  );

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to execute.");
    return;
  }

  if (txs.length === 0) {
    console.log("Nothing to apply.");
    return;
  }

  await db.transact(txs);
  console.log(`Applied ${txs.length} transaction step(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
