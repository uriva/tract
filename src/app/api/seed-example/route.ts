import { init, id as genId } from "@instantdb/admin";
import schema from "../../../../instant.schema";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN!;

const adminDb = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

// Example contract content at each stage of negotiation
const INITIAL_CONTENT = `# Freelance Design Agreement

**Between:** Alice Chen ("Client") and Bob Martinez ("Designer")

**Effective Date:** Upon signing by both parties

## 1. Scope of Work

The Designer agrees to provide the following services:

- Brand identity design (logo, color palette, typography)
- Business card and letterhead design
- Basic brand guidelines document

## 2. Timeline

The Designer will deliver all final assets within **30 business days** of project kickoff.

## 3. Compensation

The Client agrees to pay the Designer a flat fee of **$5,000**, payable as follows:

- 50% upon signing this agreement
- 50% upon delivery of final assets

## 4. Revisions

The Designer will provide up to **2 rounds of revisions** at no additional cost. Additional revisions will be billed at $100/hour.

## 5. Ownership

Upon full payment, all rights to the final deliverables transfer to the Client.

## 6. Termination

Either party may terminate this agreement with **14 days** written notice. If terminated by the Client, payment is due for all work completed to date.
`;

const BOB_EDIT_CONTENT = `# Freelance Design Agreement

**Between:** Alice Chen ("Client") and Bob Martinez ("Designer")

**Effective Date:** Upon signing by both parties

## 1. Scope of Work

The Designer agrees to provide the following services:

- Brand identity design (logo, color palette, typography)
- Business card and letterhead design
- Basic brand guidelines document
- Social media profile assets (3 platforms)

## 2. Timeline

The Designer will deliver all final assets within **45 business days** of project kickoff.

## 3. Compensation

The Client agrees to pay the Designer a flat fee of **$7,500**, payable as follows:

- 30% upon signing this agreement
- 30% at project midpoint
- 40% upon delivery of final assets

## 4. Revisions

The Designer will provide up to **3 rounds of revisions** at no additional cost. Additional revisions will be billed at $150/hour.

## 5. Ownership

Upon full payment, all rights to the final deliverables transfer to the Client. The Designer retains the right to display the work in their portfolio.

## 6. Termination

Either party may terminate this agreement with **14 days** written notice. If terminated by the Client, payment is due for all work completed to date.

## 7. Confidentiality

Both parties agree not to disclose proprietary information shared during the project without prior written consent.
`;

const ALICE_EDIT_CONTENT = `# Freelance Design Agreement

**Between:** Alice Chen ("Client") and Bob Martinez ("Designer")

**Effective Date:** Upon signing by both parties

## 1. Scope of Work

The Designer agrees to provide the following services:

- Brand identity design (logo, color palette, typography)
- Business card and letterhead design
- Comprehensive brand guidelines document (minimum 10 pages)

## 2. Timeline

The Designer will deliver all final assets within **30 business days** of project kickoff. Late delivery incurs a 5% discount per week.

## 3. Compensation

The Client agrees to pay the Designer a flat fee of **$5,000**, payable as follows:

- 25% upon signing this agreement
- 75% upon delivery of final assets

## 4. Revisions

The Designer will provide up to **2 rounds of revisions** at no additional cost. Additional revisions will be billed at $100/hour.

## 5. Ownership

Upon full payment, all rights to the final deliverables transfer to the Client exclusively. The Designer may not use the work in portfolios without written permission.

## 6. Termination

Either party may terminate this agreement with **7 days** written notice. If terminated by the Client, payment is due for all work completed to date.
`;

export async function POST(req: Request) {
  const { userId, email } = await req.json();

  if (!userId) {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  // Check if user already has an example contract (by checking participants)
  const existing = await adminDb.query({
    participants: {
      contract: {},
      $: { where: { "user.id": userId } },
    },
  });

  const hasExample = (existing?.participants ?? []).some(
    (p) => p.contract && (p.contract as Record<string, unknown>).name === "Example: Freelance Design Agreement"
  );

  if (hasExample) {
    return Response.json({ seeded: false, reason: "already exists" });
  }

  // Create IDs
  const contractId = genId();
  const commit1 = genId(); // Initial draft (Alice)
  const commit2 = genId(); // Bob's edits (diverges from commit1)
  const commit3 = genId(); // Alice's edits (diverges from commit1)
  const alicePid = genId();
  const bobPid = genId();
  const userPid = genId();

  const now = Date.now();

  await adminDb.transact([
    // Contract
    adminDb.tx.contracts[contractId].update({
      name: "Example: Freelance Design Agreement",
      createdAt: now - 3600_000, // 1 hour ago
    }),

    // Commit 1: initial draft by Alice
    adminDb.tx.commits[commit1]
      .update({
        content: INITIAL_CONTENT,
        message: "Initial draft of the freelance design agreement",
        createdAt: now - 3600_000,
      })
      .link({ contract: contractId }),

    // Commit 2: Bob's edits (parent: commit1) — diverges
    adminDb.tx.commits[commit2]
      .update({
        content: BOB_EDIT_CONTENT,
        message:
          "Add social media assets to scope, increase budget to $7,500 with 3-part payment, add confidentiality clause and portfolio rights",
        createdAt: now - 1800_000, // 30 min ago
      })
      .link({ contract: contractId })
      .link({ parent: commit1 }),

    // Commit 3: Alice's edits (parent: commit1) — diverges from Bob
    adminDb.tx.commits[commit3]
      .update({
        content: ALICE_EDIT_CONTENT,
        message:
          "Require comprehensive brand guidelines, add late delivery penalty, shift payment to 25/75 split, restrict portfolio use, shorten termination notice to 7 days",
        createdAt: now - 900_000, // 15 min ago
      })
      .link({ contract: contractId })
      .link({ parent: commit1 }),

    // Alice participant: points at her own edit (commit3)
    adminDb.tx.participants[alicePid]
      .update({
        role: "owner",
        headCommitId: commit3,
        email: "alice@example.com",
        joinedAt: now - 3600_000,
      })
      .link({ contract: contractId }),

    // Bob participant: points at his own edit (commit2)
    adminDb.tx.participants[bobPid]
      .update({
        role: "collaborator",
        headCommitId: commit2,
        email: "bob@example.com",
        joinedAt: now - 3500_000,
      })
      .link({ contract: contractId }),

    // The actual user: collaborator, pointing at the initial commit
    adminDb.tx.participants[userPid]
      .update({
        role: "collaborator",
        headCommitId: commit1,
        email: (email || `guest-${userId.slice(0, 8)}`).toLowerCase(),
        joinedAt: now,
      })
      .link({ contract: contractId })
      .link({ user: userId }),
  ]);

  return Response.json({ seeded: true, contractId });
}
