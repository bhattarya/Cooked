// The COOKED mark: a two-tone flame and the wordmark.
export function Flame({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 .8-3.3 2-4.5.2 1.6 1 2.6 2 3 0-3.2-.6-5.6 1-8.5Z" fill="#ff5a1f" />
      <path d="M12 14.5c.6 1.3 2 2 2 3.5a2 2 0 0 1-4 0c0-1 .6-1.7 1.2-2.3.2.6.5 1 .8 1.1 0-.8-.3-1.5 0-2.3Z" fill="#ffd166" />
    </svg>
  );
}

export function Wordmark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Flame size={size * 1.15} />
      <span className="display font-semibold tracking-[0.18em]" style={{ fontSize: size * 0.8 }}>
        COOKED
      </span>
    </span>
  );
}
