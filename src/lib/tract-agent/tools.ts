import { id as genId, type InstaQLEntity } from "@instantdb/admin";
import schema from "../../../instant.schema";
import { adminDb, appUrl, toolsPath } from "./config";
import type { SignedToolMeta } from "./signing";

/* eslint-disable @typescript-eslint/no-empty-object-type -- InstantDB relation
   selections are expressed as empty objects, e.g. { author: {} }. */
type CommitWithRefs = InstaQLEntity<
  typeof schema,
  "commits",
  { author: {}; parent: {} }
>;
type ParticipantWithUser = InstaQLEntity<
  typeof schema,
  "participants",
  { user: {} }
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

type ToolParams = Record<string, unknown>;

/**
 * A Tract remote tool. Parameters are described as a JSON Schema object (the
 * shape prompt2bot forwards to the model). Handlers run server-side with admin
 * privileges and return a plain JSON-serializable result.
 */
export interface TractTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (
    params: ToolParams,
    meta: SignedToolMeta,
  ) => Promise<unknown> | unknown;
}

const object = (
  properties: Record<string, unknown>,
  required: string[],
) => ({ type: "object", properties, required, additionalProperties: false });

const str = (description: string) => ({ type: "string", description });

const requireStr = (value: unknown, message: string): string => {
  if (typeof value !== "string" || value === "") throw new Error(message);
  return value;
};

const requirePresent = <T>(value: T | undefined | null, message: string): T => {
  if (value === undefined || value === null) throw new Error(message);
  return value;
};

// --- data shaping helpers -------------------------------------------------

const shapeCommit = (c: CommitWithRefs) => ({
  id: c.id,
  message: c.message,
  createdAt: c.createdAt,
  author: c.author?.id
    ? { id: c.author.id, email: c.author.email }
    : null,
  authorLabel: c.author?.id ? (c.author.email ?? "user") : "Tract",
  parentId: c.parent?.id ?? null,
});

const shapeParticipant = (p: ParticipantWithUser) => ({
  id: p.id,
  role: p.role,
  email: p.email ?? p.user?.email ?? null,
  userId: p.user?.id ?? null,
  headCommitId: p.headCommitId ?? null,
  signedAt: p.signedAt ?? null,
});

// --- tools ----------------------------------------------------------------

const getContractTool: TractTool = {
  name: "get_contract",
  description:
    "Read a contract's full state: participants (with their current head commit), the commit history (metadata only, not content), open issues with their comment threads, and open pull requests. Use this first to understand the situation before acting.",
  parameters: object(
    { contractId: str("ID of the contract to inspect.") },
    ["contractId"],
  ),
  handler: async (params) => {
    const contractId = requireStr(params.contractId, "contractId is required");
    const result = await adminDb.query({
      contracts: {
        $: { where: { id: contractId } },
        owner: {},
        commits: { author: {}, parent: {} },
        participants: { user: {} },
        issues: {
          creator: {},
          commit: {},
          comments: { creator: {} },
        },
        pullRequests: {
          sourceCommit: { author: {} },
          targetParticipant: { user: {} },
          requester: {},
        },
      },
    });
    const contract = requirePresent(
      result?.contracts?.[0],
      `Contract ${contractId} not found`,
    );

    return {
      id: contract.id,
      name: contract.name,
      ownerUserId: contract.owner?.id ?? null,
      participants: (contract.participants ?? []).map(shapeParticipant),
      commits: (contract.commits ?? []).map(shapeCommit),
      issues: (contract.issues ?? []).map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        lineNumber: i.lineNumber ?? null,
        commitId: i.commit?.id ?? null,
        creatorUserId: i.creator?.id ?? null,
        comments: (i.comments ?? [])
          .slice()
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((c) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
            author: c.creator?.id ? (c.creator.email ?? "user") : "Tract",
          })),
      })),
      pullRequests: (contract.pullRequests ?? []).map((pr) => ({
        id: pr.id,
        status: pr.status,
        message: pr.message ?? null,
        sourceCommitId: pr.sourceCommit?.id ?? null,
        targetParticipantId: pr.targetParticipant?.id ?? null,
      })),
    };
  },
};

const getCommitTool: TractTool = {
  name: "get_commit",
  description:
    "Read the full Markdown content of a single commit (contract version). Use this to see the exact text before proposing changes.",
  parameters: object(
    { commitId: str("ID of the commit whose content to read.") },
    ["commitId"],
  ),
  handler: async (params) => {
    const commitId = requireStr(params.commitId, "commitId is required");
    const result = await adminDb.query({
      commits: { $: { where: { id: commitId } }, author: {}, parent: {} },
    });
    const commit = requirePresent(
      result?.commits?.[0],
      `Commit ${commitId} not found`,
    );
    return { ...shapeCommit(commit), content: commit.content };
  },
};

const createCommitTool: TractTool = {
  name: "create_commit",
  description:
    "Create a new proposed contract version (a commit authored by Tract) as a child of an existing commit. Returns the new commit id. This does NOT change anyone's current version — pair it with open_pull_request so the affected participant can review and accept it. Never mutate an existing commit; always create a new one.",
  parameters: object(
    {
      contractId: str("ID of the contract this version belongs to."),
      parentCommitId: str(
        "ID of the commit this new version is based on (its parent). Usually the head commit of the participant you are helping.",
      ),
      content: str("The full Markdown content of the new contract version."),
      message: str(
        "A short commit message (1-2 sentences) describing what changed and why.",
      ),
    },
    ["contractId", "parentCommitId", "content", "message"],
  ),
  handler: async (params) => {
    const contractId = requireStr(params.contractId, "contractId is required");
    const parentCommitId = requireStr(
      params.parentCommitId,
      "parentCommitId is required",
    );
    const content = requireStr(params.content, "content is required");
    const message = requireStr(params.message, "message is required");

    const parentCheck = await adminDb.query({
      commits: { $: { where: { id: parentCommitId } }, contract: {} },
    });
    const parent = requirePresent(
      parentCheck?.commits?.[0],
      `parentCommitId ${parentCommitId} not found`,
    );
    if (parent.contract?.id !== contractId) {
      throw new Error("parentCommitId does not belong to contractId");
    }

    const commitId = genId();
    await adminDb.transact([
      adminDb.tx.commits[commitId]
        .update({ content, message, createdAt: Date.now() })
        .link({ contract: contractId, parent: parentCommitId }),
    ]);
    return { commitId };
  },
};

const openPullRequestTool: TractTool = {
  name: "open_pull_request",
  description:
    "Open a pull request proposing a Tract commit to one or two participants for review. This is how Tract affects someone's version: it never edits their version directly, it proposes changes they can accept. Provide 1 or 2 target participant IDs (e.g. both parties when a change concerns both).",
  parameters: object(
    {
      contractId: str("ID of the contract."),
      sourceCommitId: str(
        "ID of the Tract commit to propose (from create_commit).",
      ),
      targetParticipantIds: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 2,
        description:
          "One or two participant IDs to open the pull request to.",
      },
      message: str("Short description of the proposal shown on the PR."),
    },
    ["contractId", "sourceCommitId", "targetParticipantIds", "message"],
  ),
  handler: async (params) => {
    const contractId = requireStr(params.contractId, "contractId is required");
    const sourceCommitId = requireStr(
      params.sourceCommitId,
      "sourceCommitId is required",
    );
    const message = requireStr(params.message, "message is required");
    const targets: string[] = Array.isArray(params.targetParticipantIds)
      ? params.targetParticipantIds.filter(
          (t): t is string => typeof t === "string" && t !== "",
        )
      : [];
    if (targets.length < 1 || targets.length > 2) {
      throw new Error("Provide one or two targetParticipantIds");
    }

    const check = await adminDb.query({
      contracts: {
        $: { where: { id: contractId } },
        participants: {},
        commits: { $: { where: { id: sourceCommitId } } },
      },
    });
    const contract = requirePresent(
      check?.contracts?.[0],
      `Contract ${contractId} not found`,
    );
    if (!contract.commits?.length) {
      throw new Error("sourceCommitId does not belong to contractId");
    }
    const validIds = new Set((contract.participants ?? []).map((p) => p.id));
    for (const pid of targets) {
      if (!validIds.has(pid)) {
        throw new Error(`targetParticipantId ${pid} is not a participant`);
      }
    }

    const prIds = targets.map((participantId) => {
      const prId = genId();
      return {
        prId,
        tx: adminDb.tx.pullRequests[prId]
          .update({
            status: "open",
            createdAt: Date.now(),
            message: `Tract proposal: ${message}`,
          })
          .link({
            contract: contractId,
            sourceCommit: sourceCommitId,
            targetParticipant: participantId,
          }),
      };
    });

    await adminDb.transact(prIds.map((p) => p.tx));
    return { pullRequestIds: prIds.map((p) => p.prId) };
  },
};

const replyInThreadTool: TractTool = {
  name: "reply_in_thread",
  description:
    "Post a reply comment from Tract into an issue's discussion thread. Use this to answer the participant, explain a proposal, or ask a clarifying question. The comment has no author, so it renders as coming from Tract.",
  parameters: object(
    {
      issueId: str("ID of the issue (discussion thread) to reply in."),
      content: str("The reply text (Markdown)."),
    },
    ["issueId", "content"],
  ),
  handler: async (params) => {
    const issueId = requireStr(params.issueId, "issueId is required");
    const content = requireStr(params.content, "content is required");
    const check = await adminDb.query({
      issues: { $: { where: { id: issueId } } },
    });
    requirePresent(check?.issues?.[0], `Issue ${issueId} not found`);

    const commentId = genId();
    await adminDb.transact([
      adminDb.tx.comments[commentId]
        .update({ content, createdAt: Date.now() })
        .link({ issue: issueId }),
    ]);
    return { commentId };
  },
};

export const tractTools: TractTool[] = [
  getContractTool,
  getCommitTool,
  createCommitTool,
  openPullRequestTool,
  replyInThreadTool,
];

export const findTool = (name: string) =>
  tractTools.find((t) => t.name === name);

/** Remote-tool descriptors registered with prompt2bot via set-custom-tools. */
export const remoteToolDescriptors = () =>
  tractTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    url: `${appUrl()}/api/${toolsPath}/${t.name}`,
  }));
