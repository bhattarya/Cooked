import { notFound } from "next/navigation";
import { Gallery } from "@/components/viz/dev/Gallery";

export const metadata = { title: "viz gallery (dev)", robots: { index: false } };

// Dev-only playground for the chart library. All data on it is FAKE and labelled as such.
export default function VizGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
