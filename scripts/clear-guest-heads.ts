/**
 * One-off migration: clear the version pointer (headCommitId) for guest
 * participants on shared contracts.
 *
 * Guests are view-only: an authenticated user with no email (anonymous "Try as
 * guest" sign-in). A guest participant must never hold a version pointer, so it
 * is never counted as an approver in the "This is <...>'s version" line.
 *
 * A participant is treated as a guest here when it has no email. This also
 * covers legacy invite-link template records (no user + no email); those are
 * separately filtered out of the UI, but clearing their head is harmless.
 *
 * Exception: a guest who is the OWNER of the contract keeps their version
 * pointer. Those are solo guest-created documents where clearing the head would
 * break the guest's view of their own document. We only clear the pointer for
 * guests participating in someone else's shared contract.
 *
 * Usage (from the project root):
 *   node --experimental-strip-types --env-file=.env.local scripts/clear-guest-heads.ts          # dry run
 *   node --experimental-strip-types --env-file=.env.local scripts/clear-guest-heads.ts --apply  # execute
 */

import { init } from "@instantdb/admin";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID?.trim();
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN?.trim();

if (!APP_ID || !ADMIN_TOKEN) {
  console.error(
    "Missing NEXT_PUBLIC_INSTANT_APP_ID or INSTANT_ADMIN_TOKEN. Run with --env-file=.env.local",
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

async function main() {
  const res = await db.query({
    contracts: {
      participants: { user: {} },
      owner: {},
    },
  });

  const toClear: {
    contractId: string;
    contractName: string;
    participantId: string;
    label: string;
    head: string;
  }[] = [];

  // Without a schema, the admin SDK returns linked entities as arrays.
  const first = (v: unknown): { id?: string } | undefined =>
    Array.isArray(v) ? v[0] : (v as { id?: string } | undefined);

  for (const c of res.contracts as any[]) {
    const ownerId = first(c.owner)?.id;
    for (const p of (c.participants ?? []) as any[]) {
      const userId = first(p.user)?.id;
      const isGuest = !p.email; // no email => guest (or invite template)
      // Skip guests who own the contract (solo guest-created documents).
      const isContractOwner = !!ownerId && userId === ownerId;
      if (isGuest && !isContractOwner && p.headCommitId) {
        toClear.push({
          contractId: c.id,
          contractName: c.name,
          participantId: p.id,
          label: userId ? `guest-${userId.slice(0, 4)}` : "guest (invite template)",
          head: (p.headCommitId as string).slice(0, 7),
        });
      }
    }
  }

  if (toClear.length === 0) {
    console.log("No guest participants with a version pointer found. Nothing to do.");
    return;
  }

  console.log(
    `Found ${toClear.length} guest participant(s) with a version pointer:\n`,
  );
  for (const t of toClear) {
    console.log(
      `  [${t.contractName}] ${t.label} — head ${t.head} (participant ${t.participantId})`,
    );
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to clear these version pointers.");
    return;
  }

  await db.transact(
    toClear.map((t) => db.tx.participants[t.participantId].update({ headCommitId: null })),
  );

  console.log(`\nCleared version pointer for ${toClear.length} guest participant(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
