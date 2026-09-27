import { notFound } from "next/navigation";
import { Landing } from "@/components/Landing";

// Dev-only: renders the landing in each sign-in state without touching env or cookies.
//   /dev/landing?method=firebase|google|none&as=guest|user&error=bad_state
export default async function LandingPlayground({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const method = q.method === "none" ? null : q.method === "google" ? "google" : "firebase";
  const signedIn = q.as === "guest" ? { firstName: "there", guest: true } : q.as === "user" ? { firstName: "Arya", guest: false } : null;
  return <Landing method={method} signedIn={signedIn} error={typeof q.error === "string" ? q.error : undefined} />;
}
