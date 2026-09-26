import { cookies } from "next/headers";
import { Landing } from "@/components/Landing";
import { SESSION_COOKIE, googleConfigured, readSession } from "@/lib/session";

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const { error } = await searchParams;
  return <Landing googleReady={googleConfigured()} signedIn={user ? user.firstName : null} error={typeof error === "string" ? error : undefined} />;
}
