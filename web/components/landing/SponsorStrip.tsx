// The five sponsors whose services run inside COOKED, with what each one does here.
const SPONSORS = [
  { name: "Gemini", role: "reads & routes" },
  { name: "Backboard", role: "memory" },
  { name: "Tiger Data", role: "Postgres" },
  { name: "DigitalOcean", role: "deploy" },
];

/** Text-only credits row: quiet until hovered, so it credits without competing with the sign-in. */
export function SponsorStrip({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-center text-[10.5px] uppercase tracking-[0.18em] text-[#8f8773] xl:text-right">Built with</p>
      <ul className="mt-2.5 flex flex-wrap justify-center gap-x-6 gap-y-2.5 sm:gap-x-7 xl:justify-end">
        {SPONSORS.map((s) => (
          <li key={s.name} className="group flex flex-col items-center gap-0.5 xl:items-end">
            <span className="text-[13.5px] font-medium leading-none text-muted transition-colors duration-300 group-hover:text-cream">{s.name}</span>
            <span className="num text-[10px] leading-none tracking-wide text-[#8f8773] transition-colors duration-300 group-hover:text-gold-lo">{s.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
