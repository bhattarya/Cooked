import { Cockpit } from "@/components/Cockpit";

export default async function StudentPage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  return <Cockpit id={decodeURIComponent(id)} />;
}
