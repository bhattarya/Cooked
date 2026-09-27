import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Queue } from "@/components/Queue";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export const metadata = { title: "Watchtower · COOKED" };

/** The Watchtower: every current student scored by the trained model, real API data. "advisor" is the
    long-standing scene id (voice alias: "watchtower") -- kept so existing voice routing needs no changes. */
export default async function WatchtowerPage() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/");
  return <Queue user={user} canSeeRows={!user.guest} />;
}
