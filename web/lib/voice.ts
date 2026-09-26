"use client";

// Voice delivery. With the backend up, clips come from ElevenLabs via GET /audio/{hash}
// (cached in app.voice_clip). Without it, the browser's speech synthesis stands in so the
// demo path still works offline. onWord fires with the character index being spoken.
export type VoiceName = "narrator" | "coach";

export interface Speaking {
  stop: () => void;
  done: Promise<void>;
}

const API = process.env.NEXT_PUBLIC_API_URL;

async function clipUrl(text: string, voice: VoiceName): Promise<string | null> {
  if (!API) return null;
  try {
    const r = await fetch(`${API}/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!r.ok) return null;
    const { data } = (await r.json()) as { data: { hash: string; available: boolean } };
    return data.available ? `${API}/audio/${data.hash}` : null;
  } catch {
    return null;
  }
}

export type VoiceSource = "elevenlabs" | "browser" | "none";

export function speak(
  text: string,
  voice: VoiceName,
  onWord: (charIndex: number) => void,
  onLevel: (level: number) => void,
  onSource: (s: VoiceSource) => void = () => {},
): Speaking {
  let stopped = false;
  let stopFn = () => {};
  const done = (async () => {
    const url = await clipUrl(text, voice);
    if (stopped) return;
    if (url) {
      onSource("elevenlabs");
      const audio = new Audio(url);
      audio.crossOrigin = "anonymous";
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(audio);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      an.connect(ctx.destination);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        an.getByteFrequencyData(buf);
        onLevel(buf.reduce((s, v) => s + v, 0) / buf.length / 255);
        // approximate word sync by playback progress
        if (audio.duration) onWord(Math.floor((audio.currentTime / audio.duration) * text.length));
        raf = requestAnimationFrame(tick);
      };
      stopFn = () => {
        audio.pause();
        cancelAnimationFrame(raf);
        ctx.close();
      };
      await audio.play();
      tick();
      await new Promise<void>((res) => (audio.onended = () => res()));
      stopFn();
      onWord(text.length);
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onSource("none");
      onWord(text.length);
      return;
    }
    onSource("browser");
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const pick =
      voices.find((v) => /Samantha|Daniel|Google UK English (Female|Male)|Serena|Karen/.test(v.name) && v.lang.startsWith("en")) ||
      voices.find((v) => v.lang.startsWith("en"));
    if (pick) u.voice = pick;
    u.rate = voice === "coach" ? 0.95 : 1.02;
    u.pitch = voice === "coach" ? 1.05 : 0.95;
    let raf = 0;
    let t = 0;
    const pulse = () => {
      t += 0.18;
      onLevel(0.35 + 0.3 * Math.abs(Math.sin(t)) * Math.random());
      raf = requestAnimationFrame(pulse);
    };
    u.onboundary = (e) => onWord(e.charIndex);
    stopFn = () => {
      window.speechSynthesis.cancel();
      cancelAnimationFrame(raf);
      onLevel(0);
    };
    await new Promise<void>((res) => {
      u.onend = () => res();
      u.onerror = () => res();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      pulse();
    });
    cancelAnimationFrame(raf);
    onLevel(0);
    onWord(text.length);
  })();
  return {
    stop: () => {
      stopped = true;
      stopFn();
    },
    done,
  };
}
