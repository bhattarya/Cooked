"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Flame } from "./brand";
import { CrowdCanvas } from "./ui/skiper39";

// Open Peeps sprite sheet (15 × 7) used by Skiper UI's crowd canvas.
const PEEPS = "https://cdn.21st.dev/assets/localized/abdb8990a7bef8c2f5af3e45f0a3c969c4b0603fba8be92e81347de4ea4e1ed7.png";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server yet. Continue as a guest.",
  google_denied: "Google sign-in was cancelled.",
  bad_state: "That sign-in link expired. Try again.",
  token_exchange: "Google didn't accept the sign-in. Try again.",
  no_id_token: "Google didn't return an identity. Try again.",
  bad_id_token: "Couldn't verify the Google sign-in. Try again.",
};

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function Landing({ googleReady, signedIn, error }: { googleReady: boolean; signedIn: string | null; error?: string }) {
  const [leaving, setLeaving] = useState(false);
  const go = (href: string, post = false) => {
    setLeaving(true);
    setTimeout(() => {
      if (post) {
        const f = document.createElement("form");
        f.method = "POST";
        f.action = href;
        document.body.appendChild(f);
        f.submit();
      } else window.location.href = href;
    }, 450);
  };

  return (
    <main className="relative h-dvh min-h-[640px] w-full overflow-hidden bg-[#f4f1ea] text-[#07080b]">
      <div className="absolute inset-x-0 bottom-0 h-[68%]">
        <CrowdCanvas src={PEEPS} rows={15} cols={7} highlight={0.13} highlightColor="#ff7a45" className="absolute bottom-0 h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[52%] bg-gradient-to-b from-[#f4f1ea] via-[#f4f1ea] to-transparent" />

      <div className="relative z-10 flex flex-col items-center px-6 pt-[9vh] text-center">
        <motion.div initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="flex items-center gap-3 sm:gap-4">
          <motion.span animate={{ rotate: [0, -4, 3, 0], scale: [1, 1.06, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
            <Flame size={64} />
          </motion.span>
          <span className="display text-[clamp(56px,11vw,132px)] font-semibold leading-none tracking-[0.06em]">COOKED</span>
        </motion.div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-4 max-w-md text-lg text-black/55">
          Know you&apos;re cooked before it&apos;s too late. Then get un-cooked.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="pointer-events-auto mt-8 flex flex-col items-center gap-3">
          {signedIn ? (
            <button onClick={() => go("/app")} className="rounded-full bg-[#07080b] px-7 py-3.5 text-[15px] font-medium text-[#f4f1ea] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition hover:scale-[1.03]">
              Continue as {signedIn} →
            </button>
          ) : googleReady ? (
            <>
              <button onClick={() => go("/auth/google")} className="flex items-center gap-3 rounded-full bg-[#07080b] px-7 py-3.5 text-[15px] font-medium text-[#f4f1ea] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition hover:scale-[1.03]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                  <GoogleG />
                </span>
                Continue with Google
              </button>
              <button onClick={() => go("/auth/guest", true)} className="text-sm text-black/45 underline-offset-4 hover:text-black/70 hover:underline">
                or continue as a guest
              </button>
            </>
          ) : (
            <>
              <button onClick={() => go("/auth/guest", true)} className="rounded-full bg-[#07080b] px-7 py-3.5 text-[15px] font-medium text-[#f4f1ea] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition hover:scale-[1.03]">
                Continue as guest →
              </button>
              <span className="flex items-center gap-2 text-xs text-black/40">
                <GoogleG /> Google sign-in turns on once AUTH_GOOGLE_ID is set
              </span>
            </>
          )}
          {error && ERRORS[error] && <p className="max-w-xs text-sm text-[#c2410c]">{ERRORS[error]}</p>}
        </motion.div>
      </div>

      <div className="absolute inset-x-0 bottom-3 z-10 mx-auto flex w-fit max-w-[92%] flex-wrap justify-center gap-x-4 gap-y-1 rounded-full bg-[#f4f1ea]/85 px-4 py-1.5 text-[10.5px] text-black/55 backdrop-blur-sm">
        <a href="https://github.com/jasonpaluck/hackumbc-2026" target="_blank" rel="noreferrer" className="underline decoration-black/25 underline-offset-2 hover:text-black/80">
          Synthetic HackUMBC 2026 dataset (UMBC DoIT, CC0)
        </a>
        <span>Gemini · ElevenLabs · Backboard · Tiger Data · DigitalOcean</span>
        <span>Crowd: Skiper UI · Open Peeps</span>
      </div>

      <AnimatePresence>
        {leaving && (
          <motion.div
            className="fixed inset-0 z-50 bg-[#07080b]"
            initial={{ clipPath: "circle(0% at 50% 42%)" }}
            animate={{ clipPath: "circle(150% at 50% 42%)" }}
            transition={{ duration: 0.55, ease: [0.7, 0, 0.3, 1] }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
