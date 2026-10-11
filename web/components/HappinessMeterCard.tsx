import { happiness } from "@/lib/gate";
import type { Viewer } from "@/lib/gate";
import { HappinessMeter } from "./HappinessMeter";
import { Section } from "./ui";

export async function HappinessMeterCard({
  viewer,
  vehicle,
}: {
  viewer: Viewer;
  vehicle: string;
}) {
  const data = await happiness(viewer, vehicle);

  return (
    <Section title="Customer pain addressed" aside="Share of negative comments covered by approved requirements">
      <HappinessMeter data={data} />
    </Section>
  );
}
