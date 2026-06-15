import { init } from "@instantdb/admin";
import schema from "../../../../instant.schema";

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID?.trim()!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN?.trim()!;

const adminDb = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

export async function POST(req: Request) {
  const { userId, email } = await req.json();

  if (!userId || !email) {
    return Response.json({ error: "Missing userId or email" }, { status: 400 });
  }

  // Find participant records with this email that have no user link
  const result = await adminDb.query({
    participants: {
      user: {},
      $: { where: { email: email.toLowerCase() } },
    },
  });

  const unclaimed = (result?.participants ?? []).filter(
    (p: any) => !p.user
  );

  if (unclaimed.length === 0) {
    return Response.json({ claimed: 0 });
  }

  // Link each unclaimed participant to this user
  await adminDb.transact(
    unclaimed.map((p: any) =>
      adminDb.tx.participants[p.id].link({ user: userId })
    )
  );

  return Response.json({ claimed: unclaimed.length });
}
