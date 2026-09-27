import { cookies } from "next/headers";
import { Landing } from "@/components/Landing";
import { SESSION_COOKIE, readSession, signInMethod } from "@/lib/session";

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const { error } = await searchParams;
  return <Landing method={signInMethod()} signedIn={user ? { firstName: user.firstName, guest: user.guest } : null} error={typeof error === "string" ? error : undefined} />;
}
