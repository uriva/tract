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
      delete: "auth.id == data.ref('owner.id')",
    },
  },
  commits: {
    allow: {
      // Participants of the parent contract can view
      view: "auth.id in data.ref('contract.participants.user.id')",
      // Any authenticated user can create commits
      create: "auth.id != null",
      // Commits are immutable
      update: "false",
      delete: "false",
    },
  },
  participants: {
    allow: {
      // Can view if you're also a participant of the same contract
      view: "auth.id in data.ref('contract.participants.user.id')",
      // Any authenticated user (needed for invite flow)
      create: "auth.id != null",
      // Only the participant themselves can update (e.g. move HEAD)
      update: "auth.id == data.ref('user.id')",
      // Only the contract owner can remove participants
      delete: "auth.id in data.ref('contract.owner.id')",
    },
  },
} as const;
