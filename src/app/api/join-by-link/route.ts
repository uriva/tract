import { init, id } from "@instantdb/admin";
import schema from "../../../../instant.schema";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID?.trim()!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN?.trim()!;

const adminDb = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

export async function POST(req: Request) {
  try {
    const { participantId, userId, email } = await req.json();

    if (!participantId || !userId) {
      return Response.json({ error: "Missing participantId or userId" }, { status: 400 });
    }

    // Query participant by ID using adminDb
    const result = await adminDb.query({
      participants: {
        contract: {},
        user: {},
        $: { where: { id: participantId } },
      },
    });

    const participant = result?.participants?.[0];
    if (!participant) {
      return Response.json({ error: "Invite link not found or invalid" }, { status: 404 });
    }

    const contract = participant.contract;
    if (!contract) {
      return Response.json({ error: "Contract not found for this invite" }, { status: 404 });
    }

    const contractId = contract.id;

    // Check if this user is already a participant in the contract
    const userQuery = await adminDb.query({
      $users: {
        participations: {
          contract: {},
        },
        $: { where: { id: userId } },
      },
    });

    const existingParticipant = userQuery?.$users?.[0]?.participations?.find(
      (p: any) => p.contract?.id === contractId
    );

    const alreadyParticipant = !!existingParticipant;

    const isUnlimited = participant.inviteType === "unlimited";

    if (alreadyParticipant) {
      if (!isUnlimited && existingParticipant.id !== participantId) {
        // User is already a participant. Delete the redundant invite participant record
        await adminDb.transact([
          adminDb.tx.participants[participantId].delete(),
        ]);
      }
      return Response.json({ contractId });
    }

    if (isUnlimited) {
      // Create a brand new participant record for the user, copying settings from the template
      const newParticipantId = id();
      const updateData: any = {
        role: participant.role || "collaborator",
        headCommitId: participant.headCommitId,
        joinedAt: Date.now(),
      };
      if (email) {
        updateData.email = email.toLowerCase();
      }

      await adminDb.transact([
        adminDb.tx.participants[newParticipantId]
          .update(updateData)
          .link({ contract: contractId })
          .link({ user: userId }),
      ]);

      return Response.json({ contractId });
    }

    // Check if participant is already linked to a user
    if (participant.user) {
      if (participant.user.id === userId) {
        // Already joined
        return Response.json({ contractId });
      } else {
        // Linked to someone else
        return Response.json(
          { error: "This invite link has already been used by another user." },
          { status: 400 }
        );
      }
    }

    // Update participant with user link and email
    const updateData: any = {};
    if (email) {
      updateData.email = email.toLowerCase();
    }

    await adminDb.transact([
      adminDb.tx.participants[participantId]
        .update(updateData)
        .link({ user: userId }),
    ]);

    return Response.json({ contractId });
  } catch (err) {
    console.error("Error in join-by-link API:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
