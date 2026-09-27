import type { Metadata } from "next";
import { Big_Shoulders, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from our own origin,
// so the running app needs no network for fonts.
//   display  Big Shoulders  — condensed, athletic; echoes the lettering on the COOKED emblem
//   sans     Geist          — clean UI/body text
//   mono     Geist Mono     — every number, tabular
//   serif    Instrument Serif italic — the occasional editorial line
const display = Big_Shoulders({ variable: "--f-display", subsets: ["latin"], display: "swap", fallback: ["impact", "sans-serif"] });
const sans = Geist({ variable: "--f-sans", subsets: ["latin"], display: "swap", fallback: ["system-ui", "sans-serif"] });
const mono = Geist_Mono({ variable: "--f-mono", subsets: ["latin"], display: "swap", fallback: ["monospace"] });
const serif = Instrument_Serif({ variable: "--f-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"], display: "swap", fallback: ["georgia", "serif"] });

export const metadata: Metadata = {
  title: "COOKED — know before it's too late",
  description: "An early-warning and stress-test platform for degree trajectories. Built on the synthetic HackUMBC 2026 dataset.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
