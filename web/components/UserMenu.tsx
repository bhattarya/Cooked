"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useAuth, type AuthUser } from "@/lib/auth";

export function Avatar({ user, size = 28 }: { user: AuthUser; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase();
  return user.photo && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element -- Google avatar URL; no loader needed
    <img
      src={user.photo}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full ring-1 ring-line-2"
    />
  ) : (
    <span
      className="display grid shrink-0 place-items-center rounded-full bg-heat/20 font-semibold text-heat ring-1 ring-heat/30"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

/** Nav slot: "Sign in" when signed out, avatar + menu when signed in. Hidden if auth is off. */
export function UserMenu() {
  const { enabled, loading, user, signOut } = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!enabled) return null;
  if (loading) return <span className="h-7 w-7 animate-pulse rounded-full bg-white/[0.06]" aria-hidden />;
  if (!user) {
    if (path === "/login") return null;
    return (
      <Link
        href={`/login?next=${encodeURIComponent(path)}`}
        className="rounded-full border border-line-2 px-3.5 py-1.5 text-sm text-text transition hover:border-heat/50 hover:bg-heat/10"
      >
        Sign in
      </Link>
    );
  }
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name ?? user.email}`}
        className="flex items-center rounded-full p-0.5 transition hover:ring-2 hover:ring-line-2"
      >
        <Avatar user={user} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="panel absolute right-0 top-10 z-50 w-64 overflow-hidden p-1.5 shadow-2xl"
          >
            <div className="flex items-center gap-3 px-3 py-3">
              <Avatar user={user} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name ?? "Signed in"}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
            </div>
            <div className="my-1 h-px bg-line" />
            <Link
              role="menuitem"
              href="/queue"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-white/[0.05] hover:text-text"
            >
              Institution queue
            </Link>
            <button
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await signOut();
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-white/[0.05] hover:text-text"
            >
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
