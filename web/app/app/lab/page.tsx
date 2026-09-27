import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ModelLab } from "@/components/ModelLab";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export default async function LabPage() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/");
  return <ModelLab user={user} />;
}
