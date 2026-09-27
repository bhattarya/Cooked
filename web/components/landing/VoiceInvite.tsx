"use client";

import { GoldOrb } from "@/components/theatre/GoldOrb";

/**
 * The real invitation, not a demo: one calm orb and one honest sentence. Voice is the primary
 * way into COOKED, so it gets the centre of the door card — no cycling sample questions, no
 * typing animation, just what to actually do next. The orb's own idle motion is the only
 * animated thing in this card.
 */
export function VoiceInvite() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <GoldOrb state="breathing" size={76} aria-label="Ready to listen" />
      <p className="max-w-[28ch] text-[16px] font-medium leading-snug text-cream sm:text-[17px]">
        Say what&rsquo;s on your mind, or upload your audit.
      </p>
    </div>
  );
}
