import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AuditChapter } from "@/components/chapters/AuditChapter";
import { StudioProvider } from "@/components/studio/context";
import { SESSION_COOKIE, readSession } from "@/lib/session";

// Dev-only harness: mounts the audit chapter alone, outside the Studio host, for isolated verification.
export const metadata = { title: "Audit chapter (dev)" };

export default async function AuditDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const shown = user ?? { name: "Dev", firstName: "Dev", guest: true };
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-bg text-text">
      <StudioProvider initialChapter="audit">
        <AuditChapter user={shown} />
      </StudioProvider>
    </div>
  );
}
