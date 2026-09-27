import type { ReactNode } from "react";
import { VoiceRoot } from "@/components/voice/VoiceRoot";

// One voice provider + dock for every signed-in screen; scenes register the commands they can handle.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <VoiceRoot>{children}</VoiceRoot>;
}
