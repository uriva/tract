import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    contracts: i.entity({
      name: i.string(),
      createdAt: i.number().indexed(),
      summary: i.string().optional(),
      summaryGeneratedAt: i.number().optional(),
    }),
    commits: i.entity({
      content: i.string(),
      message: i.string(),
      createdAt: i.number().indexed(),
    }),
    participants: i.entity({
      role: i.string(), // "owner" | "collaborator"
      headCommitId: i.string().optional(),
      email: i.string().indexed().optional(),
      joinedAt: i.number().indexed(),
      legalName: i.string().optional(),
      signatureData: i.string().optional(), // base64 PNG from canvas
      signedAt: i.number().optional(),
      inviteType: i.string().optional(), // "one-time" | "unlimited"
    }),
    issues: i.entity({
      title: i.string(),
      createdAt: i.number().indexed(),
      status: i.string(), // "open" | "closed"
    }),
    comments: i.entity({
      content: i.string(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    contractCommits: {
      forward: {
        on: "commits",
        has: "one",
        label: "contract",
        onDelete: "cascade",
      },
      reverse: {
        on: "contracts",
        has: "many",
        label: "commits",
      },
    },
    commitParent: {
      forward: {
        on: "commits",
        has: "one",
        label: "parent",
      },
      reverse: {
        on: "commits",
        has: "many",
        label: "children",
      },
    },
    commitAuthor: {
      forward: {
        on: "commits",
        has: "one",
        label: "author",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "commits",
      },
    },
    contractParticipants: {
      forward: {
        on: "participants",
        has: "one",
        label: "contract",
        onDelete: "cascade",
      },
      reverse: {
        on: "contracts",
        has: "many",
        label: "participants",
      },
    },
    participantUser: {
      forward: {
        on: "participants",
        has: "one",
        label: "user",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "participations",
      },
    },
    contractOwner: {
      forward: {
        on: "contracts",
        has: "one",
        label: "owner",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "ownedContracts",
      },
    },
    issueContract: {
      forward: {
        on: "issues",
        has: "one",
        label: "contract",
        onDelete: "cascade",
      },
      reverse: {
        on: "contracts",
        has: "many",
        label: "issues",
      },
    },
    issueCommit: {
      forward: {
        on: "issues",
        has: "one",
        label: "commit",
        onDelete: "cascade",
      },
      reverse: {
        on: "commits",
        has: "many",
        label: "issues",
      },
    },
    issueCreator: {
      forward: {
        on: "issues",
        has: "one",
        label: "creator",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "issues",
      },
    },
    commentIssue: {
      forward: {
        on: "comments",
        has: "one",
        label: "issue",
        onDelete: "cascade",
      },
      reverse: {
        on: "issues",
        has: "many",
        label: "comments",
      },
    },
    commentCreator: {
      forward: {
        on: "comments",
        has: "one",
        label: "creator",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "comments",
      },
    },
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
