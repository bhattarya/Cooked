import "./globals.css";

export const metadata = {
  title: "COOKED | Foundation",
  description: "A synthetic-data degree trajectory demo for HackUMBC 2026.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
