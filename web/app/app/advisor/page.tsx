import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Queue } from "@/components/Queue";
import { SESSION_COOKIE, firebaseConfigured, readSession } from "@/lib/session";

export const metadata = { title: "Watchtower · COOKED" };

export default async function AdvisorPage() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/");
  // Per-student rows are for people signed in with Google once Firebase is on (the API enforces the same rule).
  return <Queue user={user} canSeeRows={!firebaseConfigured() || !user.guest} />;
}
