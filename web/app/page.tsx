import { BoardWorkspace } from "@/components/BoardWorkspace";
import { getViewer } from "@/lib/gate";

export const dynamic = "force-dynamic";

/** Portfolio home: the Kanban board across every vehicle program the viewer may access. */
export default async function Home({ searchParams }: PageProps<"/">) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  return (
    <div className="board-content">
      <BoardWorkspace sp={sp} viewer={viewer} basePath="/" fixedVehicle={null} heading="h1" />
    </div>
  );
}
