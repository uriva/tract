#!/usr/bin/env node

/**
 * One-off script: backfill generic commit messages with LLM-generated descriptions.
 * Uses InstantDB admin API + Gemini 3.1 Pro.
 *
 * Usage: node scripts/backfill-commit-messages.mjs
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

if (!APP_ID || !ADMIN_TOKEN || !GEMINI_API_KEY) {
  console.error("Missing env vars. Ensure .env.local has NEXT_PUBLIC_INSTANT_APP_ID, INSTANT_ADMIN_TOKEN, GEMINI_API_KEY");
  process.exit(1);
}

const INSTANT_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${ADMIN_TOKEN}`,
  "app-id": APP_ID,
};

async function instantQuery(query) {
  const res = await fetch("https://api.instantdb.com/admin/query", {
    method: "POST",
    headers: INSTANT_HEADERS,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`InstantDB query failed: ${await res.text()}`);
  return res.json();
}

async function instantTransact(steps) {
  const res = await fetch("https://api.instantdb.com/admin/transact", {
    method: "POST",
    headers: INSTANT_HEADERS,
    body: JSON.stringify({ steps }),
  });
  if (!res.ok) throw new Error(`InstantDB transact failed: ${await res.text()}`);
  return res.json();
}

async function generateMessage(oldContent, newContent) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are writing a short commit message (under 10 words, no quotes, no period) summarizing what changed between two versions of a contract.

Previous version:
${oldContent || "(empty)"}

New version:
${newContent || "(empty)"}

Commit message:`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 50 },
    }),
  });

  if (!res.ok) {
    console.error("Gemini error:", await res.text());
    return null;
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

// Generic messages that should be replaced
const GENERIC = new Set([
  "Initial draft",
  "Update contract",
  "Updated contract",
]);

function isGeneric(msg) {
  return GENERIC.has(msg) || /^(Update|Initial|Edit|Change)/i.test(msg);
}

async function main() {
  console.log("Fetching all commits...");

  const data = await instantQuery({
    commits: {
      parent: {},
    },
  });

  const commits = data.commits || [];
  console.log(`Found ${commits.length} total commits.`);

  // Build a lookup by id
  const byId = new Map(commits.map((c) => [c.id, c]));

  // Filter to generic ones
  const toFix = commits.filter((c) => isGeneric(c.message));
  console.log(`${toFix.length} commits have generic messages.\n`);

  if (toFix.length === 0) {
    console.log("Nothing to backfill!");
    return;
  }

  let updated = 0;
  for (const commit of toFix) {
    // parent comes back as an array from admin API (has:"one" still returns array)
    const parentArr = commit.parent || [];
    const parent = parentArr.length > 0 ? parentArr[0] : null;
    const parentContent = parent?.content || "";

    console.log(`[${commit.id.slice(0, 8)}] "${commit.message}"`);
    console.log(`  Parent: ${parent ? parent.id.slice(0, 8) : "(none)"}`);

    // Skip root commits with empty content — just label them
    if (!commit.content && !parentContent) {
      const label = "Create empty contract";
      console.log(`  -> "${label}" (root with no content)`);
      await instantTransact([["update", "commits", commit.id, { message: label }]]);
      updated++;
      console.log(`  Updated!\n`);
      continue;
    }

    const newMsg = await generateMessage(parentContent, commit.content);
    if (!newMsg) {
      console.log(`  SKIP: failed to generate\n`);
      continue;
    }

    console.log(`  -> "${newMsg}"`);

    await instantTransact([
      ["update", "commits", commit.id, { message: newMsg }],
    ]);
    updated++;
    console.log(`  Updated!\n`);

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`Done. Updated ${updated}/${toFix.length} commits.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
