"use client";

// DEV ONLY: the Studio host with FAKE chapters, to exercise routing, voice forwarding and layout without the real screens.
import { useEffect } from "react";
import { runCommand } from "@/lib/commands";
import type { SessionUser } from "@/lib/session";
import { Studio, StudioProvider, useStudioIntent, type ChapterId } from "@/components/studio";

const user = { name: "Dev User", guest: true } as SessionUser;

const fake = (id: ChapterId) =>
  function Fake() {
    useStudioIntent(id, (i) => `FAKE ${id} answered ${i.kind}${"question" in i ? `: ${i.question}` : ""}${"field" in i ? `: ${i.field}=${i.value}` : ""}${"scene" in i ? `: ${i.scene}` : ""}`);
    return <div className="flex flex-1 items-center justify-center text-muted">FAKE {id} chapter</div>;
  };
const chapters = { audit: fake("audit"), cohort: fake("cohort"), models: fake("models"), advisor: fake("advisor") };

export function Harness() {
  useEffect(() => {
    (window as unknown as { runCommand: typeof runCommand }).runCommand = runCommand;
  }, []);
  return (
    <StudioProvider>
      <Studio user={user} canSeeRows chapters={chapters} />
    </StudioProvider>
  );
}
