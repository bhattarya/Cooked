import { cookies } from "next/headers";
import { Queue } from "@/components/Queue";
import { SESSION_COOKIE, firebaseConfigured, readSession } from "@/lib/session";

export default async function AdvisorPage() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  // Per-student rows are for people signed in with Google once Firebase is on (the API enforces the same rule).
  return <Queue canSeeRows={!firebaseConfigured() || (!!user && !user.guest)} />;
}
