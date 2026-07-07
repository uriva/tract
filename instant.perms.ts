export default {
  contracts: {
    allow: {
      // Only participants can see a contract
      view: "auth.id in data.ref('participants.user.id')",
      // Any authenticated user can create
      create: "auth.id != null",
      // Only participants can update (e.g. rename)
      update: "auth.id in data.ref('participants.user.id')",
      // Only the owner can delete
      delete: "auth.id in data.ref('owner.id')",
    },
  },
  commits: {
    allow: {
      // Participants of the parent contract can view
      view: "auth.id in data.ref('contract.participants.user.id')",
      // Any authenticated user can create commits
      create: "auth.id != null",
      // Allow updating a commit if the user is the author (e.g. for squashing/amending)
      update: "auth.id in data.ref('author.id')",
      delete: "false",
    },
  },
  participants: {
    allow: {
      // Can view if you're also a participant of the same contract
      view: "auth.id in data.ref('contract.participants.user.id')",
      // Any authenticated user (needed for invite flow)
      create: "auth.id != null",
      // Participants of the same contract can update (e.g. move version pointer)
      update: "auth.id in data.ref('contract.participants.user.id')",
      // Only the contract owner can remove participants, or participants can remove themselves
      delete: "auth.id in data.ref('contract.owner.id') || auth.id in data.ref('user.id')",
    },
  },
  issues: {
    allow: {
      view: "auth.id in data.ref('contract.participants.user.id')",
      create: "auth.id != null",
      update: "auth.id in data.ref('contract.participants.user.id')",
      delete: "auth.id in data.ref('contract.participants.user.id')",
    },
  },
  comments: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null",
      update: "auth.id in data.ref('creator.id')",
      delete: "auth.id in data.ref('creator.id')",
    },
  },
  pullRequests: {
    allow: {
      view: "auth.id in data.ref('contract.participants.user.id')",
      create: "auth.id != null",
      update: "auth.id in data.ref('contract.participants.user.id')",
      delete: "auth.id in data.ref('contract.participants.user.id')",
    },
  },
  $users: {
    allow: {
      view: "auth.id != null",
    },
  },
} as const;
