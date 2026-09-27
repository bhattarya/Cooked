"use client";

import type { KeyboardEvent, Ref } from "react";
import styles from "./explore.module.css";

export interface MicUi {
  listening: boolean;
  onToggle: () => void;
}

export interface PromptProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder: string;
  /** Push-to-talk through the browser's speech recognition. Omit when the live voice agent owns the mic or it isn't supported. */
  mic?: MicUi;
  /** ←/→ on an empty box scrub the strip instead of moving a caret that has nowhere to go. */
  onEdge?: (dir: -1 | 1) => void;
  inputRef?: Ref<HTMLInputElement>;
  size?: "big" | "compact";
}

/** The one question box: type, or tap the mic and say it. Enter asks. */
export function Prompt({ value, onChange, onSubmit, busy, placeholder, mic, onEdge, inputRef, size = "big" }: PromptProps) {
  const big = size === "big";
  const can = !busy && value.trim().length > 0;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") e.currentTarget.blur();
    else if (!value && onEdge && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      onEdge(e.key === "ArrowLeft" ? -1 : 1);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (can) onSubmit();
      }}
      className={`group/prompt relative flex w-full items-center gap-2 rounded-full border bg-panel/75 backdrop-blur-xl transition focus-within:border-gold/70 focus-within:shadow-[0_0_0_4px_rgba(246,180,26,0.12),0_0_60px_rgba(246,180,26,0.16)] ${big ? "border-gold/30 p-2 pl-6 shadow-[0_0_50px_rgba(246,180,26,0.08)]" : "border-line-2 p-1.5 pl-5"}`}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        maxLength={500}
        readOnly={busy}
        enterKeyHint="send"
        autoComplete="off"
        spellCheck={false}
        aria-label="Ask the cohort a question"
        placeholder={placeholder}
        className={`min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-dim ${big ? "py-2.5 text-[16px] sm:text-[19px]" : "py-1.5 text-[14px] sm:text-[15px]"}`}
      />
      {mic && (
        <button
          type="button"
          onClick={mic.onToggle}
          disabled={busy}
          aria-pressed={mic.listening}
          aria-label={mic.listening ? "Stop listening" : "Say your question"}
          title={mic.listening ? "Listening… tap to stop" : "Tap and say your question"}
          className={`relative grid shrink-0 place-items-center rounded-full border transition disabled:opacity-40 ${big ? "h-11 w-11" : "h-9 w-9"} ${mic.listening ? "border-gold bg-gold/15 text-gold" : "border-line-2 text-muted hover:border-gold/50 hover:text-text"}`}
        >
          {mic.listening && <span aria-hidden className={`${styles.micRing} absolute inset-0 rounded-full border border-gold`} />}
          <svg width={big ? 18 : 16} height={big ? 18 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      )}
      <button
        disabled={!can}
        className={`shrink-0 rounded-full bg-gradient-to-b from-gold-hi to-gold font-semibold text-bg transition enabled:hover:brightness-110 enabled:active:scale-[0.97] disabled:opacity-35 ${big ? "px-6 py-3 text-[15px]" : "px-4 py-2 text-[13px]"}`}
      >
        Ask
        <span aria-hidden className="ml-1.5">
          →
        </span>
      </button>
    </form>
  );
}
