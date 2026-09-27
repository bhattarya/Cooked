"use client";

import type { ReactNode } from "react";
import { CookedVoiceProvider } from "@/lib/voiceAgent";
import { VoiceDock } from "./VoiceDock";

/** Provider + dock in one: wrap the app scenes once (e.g. in web/app/app/layout.tsx). */
export function VoiceRoot({ children }: { children: ReactNode }) {
  return (
    <CookedVoiceProvider>
      {children}
      <VoiceDock />
    </CookedVoiceProvider>
  );
}
