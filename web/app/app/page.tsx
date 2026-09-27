import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StudioApp } from "@/components/studio";
import { SESSION_COOKIE, firebaseConfigured, readSession } from "@/lib/session";

export const metadata = { title: "COOKED" };

export default async function AppPage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/");
  const c = (await searchParams).c;
  // Per-student advisor rows are for people signed in with Google once Firebase is on (the API enforces the same rule).
  return <StudioApp user={user} canSeeRows={!firebaseConfigured() || !user.guest} initial={Array.isArray(c) ? c[0] : c} />;
}
