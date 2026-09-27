import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, readSession } from "@/lib/session";

// The screens are chapters of the one workspace now; old links keep working.
export default async function Page() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/");
  redirect("/app?c=cohort");
}
