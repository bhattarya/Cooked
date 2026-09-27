import Image from "next/image";

// The COOKED identity: a chef-hat Labrador over a skillet, black and gold.
// Assets are cut from the source logo by `node scripts/build-brand.mjs` (see public/brand).

/** Full emblem: dog, skillet, flames, COOKED banner and tagline. Transparent, feathered edge. */
export function Emblem({ width = 420, className = "", priority = false }: { width?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/cooked-emblem.webp"
      alt="COOKED — Student Data Bottle Neck Analyzer"
      width={width}
      height={Math.round((width * 1167) / 1100)}
      priority={priority}
      className={`select-none ${className}`}
      draggable={false}
    />
  );
}

/** The dog and skillet without the banner; for stages and hero backdrops. */
export function Mark({ width = 420, className = "", priority = false }: { width?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/cooked-mark.webp"
      alt=""
      aria-hidden
      width={width}
      height={Math.round((width * 598) / 900)}
      priority={priority}
      className={`select-none ${className}`}
      draggable={false}
    />
  );
}

/** Kept for existing call sites: now the chef dog's face in a rounded tile. */
export function Flame({ size = 24 }: { size?: number }) {
  return (
    <Image
      src="/brand/cooked-icon.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className="select-none rounded-[22%] shadow-[0_0_18px_rgba(246,180,26,0.35)]"
      draggable={false}
    />
  );
}

export function Wordmark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Flame size={Math.round(size * 1.7)} />
      <span className="display text-gold-grad font-extrabold leading-none tracking-[0.06em]" style={{ fontSize: size * 1.35 }}>
        COOKED
      </span>
    </span>
  );
}
